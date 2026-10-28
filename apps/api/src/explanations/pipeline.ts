import { sourceUpload } from "@drishya/db/schema";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyDirectorEdit,
  ExplanationDirector,
  ScopeQuestion,
  sourceGroundingIssues,
} from "@drishya/ai";
import {
  beatStart,
  creationSettingsSchema,
  fitExactTimeline,
  type MotionPlan,
  motionPlanSchema,
  planFrames,
  validChapterTotal,
} from "@drishya/contracts";
import {
  conversation,
  conversationMessage,
  explanationRevision,
} from "@drishya/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../database";
import { env } from "../env";
import { HttpError } from "../http-error";
import { checkpoint, jobFence } from "../jobs/context";
import { metric } from "../jobs/metrics";
import { reconcileCollection } from "../jobs/resources";
import { getVoices, synthesize } from "../speech/client";
import { renderExplanation } from "./render";
import {
  appendMessage,
  inferSettings,
  makeRevision,
  type RevisionRecord,
} from "./service";

const director = new ExplanationDirector({
  baseURL: env.OLLAMA_BASE_URL,
  model: env.OLLAMA_MODEL,
  timeoutMs: env.OLLAMA_TIMEOUT_MS,
  onMetric: (values) => metric("qwen", values),
});
async function releaseWriter(signal: AbortSignal) {
  if (os.totalmem() > 20 * 1024 ** 3) return;
  try {
    await fetch(`${env.OLLAMA_BASE_URL.replace(/\/$/u, "")}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        keep_alive: 0,
        stream: false,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    console.warn(
      "Writer memory release was unavailable; continuing with the configured model service.",
    );
  }
}
async function save(
  id: string,
  values: Partial<typeof explanationRevision.$inferInsert>,
) {
  const [row] = await db
    .update(explanationRevision)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(explanationRevision.id, id), jobFence()))
    .returning();
  if (!row) throw new Error("Generation lease lost while saving the video.");
  return row;
}
async function stage(
  id: string,
  name: string,
  progress: number,
  status: RevisionRecord["status"],
) {
  await checkpoint(name, progress);
  await save(id, { stage: name, progress, status });
}
async function ask(
  row: RevisionRecord,
  question: string,
  options: { label: string; value: string }[],
  kind: "question" | "chapters" = "question",
) {
  await checkpoint(
    kind === "chapters"
      ? "Waiting for chapter approval"
      : "Waiting for your choice",
    12,
  );
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(explanationRevision)
      .set({
        status: kind === "chapters" ? "awaiting_approval" : "awaiting_input",
        stage:
          kind === "chapters"
            ? "Choose how to continue"
            : "Your choice is needed",
        edit: { ...row.edit, clarification: { question, options } },
        updatedAt: new Date(),
      })
      .where(and(eq(explanationRevision.id, row.id), jobFence()))
      .returning();
    if (!updated) throw new Error("Generation lease lost.");
    await appendMessage(tx, row.conversationId, "assistant", kind, {
      outline: row.outline,
      revisionId: row.id,
      question,
      options,
    });
  });
}
async function refreshCollection(id: string) {
  await db.transaction((tx) => reconcileCollection(tx, id));
}
async function createParts(row: RevisionRecord) {
  const [chat] = await db
    .select()
    .from(conversation)
    .where(eq(conversation.id, row.conversationId));
  if (!chat) throw new HttpError(404, "Chat no longer exists.");
  const existing = await db
    .select()
    .from(explanationRevision)
    .where(eq(explanationRevision.collectionId, row.id));
  if (existing.length) {
    await refreshCollection(row.id);
    return;
  }
  await checkpoint("Queueing all chapters", 15);
  await db.transaction(async (tx) => {
    await tx
      .select()
      .from(conversation)
      .where(eq(conversation.id, chat.id))
      .for("update");
    for (const [index, proposal] of row.outline.entries()) {
      const group = row.edit.groupBeatIds?.[index];
      const plan =
        row.plan && group
          ? {
              ...row.plan,
              title: proposal.title,
              beats: row.plan.beats.filter((beat) => group.includes(beat.id)),
            }
          : null;
      await makeRevision(tx, chat, {
        title: proposal.title,
        intent: "child",
        request: `${chat.prompt}\nExplain only this part: ${proposal.objective}`,
        settings: {
          ...row.settings,
          coverage: "how_it_works",
          duration: Math.min(
            120,
            Math.max(20, Math.ceil(proposal.estimatedDuration)),
          ),
        },
        collectionId: row.id,
        partIndex: index,
        approved: true,
        plan,
      });
    }
    const [updated] = await tx
      .update(explanationRevision)
      .set({
        status: "generating",
        stage: `Generating ${row.outline.length} chapters`,
        progress: 15,
        updatedAt: new Date(),
      })
      .where(and(eq(explanationRevision.id, row.id), jobFence()))
      .returning();
    if (!updated) throw new Error("Generation lease lost.");
  });
}
async function editCollection(row: RevisionRecord, base: RevisionRecord) {
  const [chat] = await db
    .select()
    .from(conversation)
    .where(eq(conversation.id, row.conversationId));
  const parts = await db
    .select()
    .from(explanationRevision)
    .where(eq(explanationRevision.collectionId, base.id))
    .orderBy(asc(explanationRevision.partIndex));
  if (!parts.length)
    throw new HttpError(409, "The original collection has no chapter videos.");
  const existing = await db
    .select({ id: explanationRevision.id })
    .from(explanationRevision)
    .where(eq(explanationRevision.collectionId, row.id))
    .limit(1);
  if (existing.length) {
    await refreshCollection(row.id);
    return;
  }
  await checkpoint("Preparing chapter revisions", 10);
  await db.transaction(async (tx) => {
    await tx
      .select()
      .from(conversation)
      .where(eq(conversation.id, chat.id))
      .for("update");
    for (const part of parts)
      await makeRevision(tx, chat, {
        title: part.title,
        intent:
          row.edit.partId && row.edit.partId !== part.id ? "child" : "edit",
        plan: row.edit.partId && row.edit.partId !== part.id ? part.plan : null,
        approved: true,
        request: row.request,
        settings:
          row.edit.partId && row.edit.partId !== part.id
            ? part.settings
            : {
                ...row.settings,
                duration: row.edit.partId
                  ? inferSettings(row.request, part.settings).duration
                  : part.settings.duration,
              },
        collectionId: row.id,
        partIndex: part.partIndex,
        sourceRevisionId: part.id,
        edit: row.edit,
      });
    const [updated] = await tx
      .update(explanationRevision)
      .set({
        outline: base.outline,
        approved: true,
        status: "generating",
        stage: "Updating chapters",
        progress: 12,
      })
      .where(and(eq(explanationRevision.id, row.id), jobFence()))
      .returning();
    if (!updated) throw new Error("Generation lease lost.");
  });
}
export async function executeExplanation(id: string, signal: AbortSignal) {
  let [row] = await db
    .select()
    .from(explanationRevision)
    .where(eq(explanationRevision.id, id));
  if (!row) throw new HttpError(404, "Video generation not found.");
  if (row.status === "ready") return;
  row.settings = creationSettingsSchema.parse(row.settings);
  if (row.plan) row.plan = motionPlanSchema.parse(row.plan);
  if (row.settings.voice !== "male") {
    if (row.plan)
      for (const beat of row.plan.beats) {
        delete beat.audioKey;
        delete beat.audioDuration;
        delete beat.speechVerified;
        delete beat.captionCues;
        delete beat.durationInFrames;
        beat.audioPlaybackRate = 1;
      }
    row = await save(id, {
      settings: { ...row.settings, voice: "male" },
      plan: row.plan,
    });
  }
  const started = Date.now();
  try {
    await stage(id, "Understanding your request", 4, "planning");
    if (row.outline.length && row.approved) {
      if (!validChapterTotal(row.outline))
        throw new HttpError(
          409,
          "Chapters must total more than 120 seconds. Choose a single video instead.",
        );
      await createParts(row);
      return;
    }
    const [chat] = await db
      .select()
      .from(conversation)
      .where(eq(conversation.id, row.conversationId));
    if (!chat) throw new HttpError(404, "Chat no longer exists.");
    const files = await db
      .select()
      .from(sourceUpload)
      .where(eq(sourceUpload.conversationId, chat.id));
    // Keep sources independent from the revision returned by save(). Reloading
    // metadata must never remove the document before the actual writing call.
    const sources =
      row.intent === "edit"
        ? []
        : files.map(({ id, name, text }) => ({ id, name, text }));
    let plan = row.plan;
    if (!plan && row.intent === "edit") {
      const [base] = row.sourceRevisionId
        ? await db
            .select()
            .from(explanationRevision)
            .where(eq(explanationRevision.id, row.sourceRevisionId))
        : [];
      if (!base)
        throw new HttpError(409, "The original version is unavailable.");
      if (!base.plan && base.outline.length) {
        await editCollection(row, base);
        return;
      }
      if (!base.plan)
        throw new HttpError(409, "Choose a completed video before editing.");
      base.plan = motionPlanSchema.parse(base.plan);
      const selected =
        row.edit.selectedBeatIds ??
        (row.edit.beatId
          ? [row.edit.beatId]
          : row.edit.timestamp !== undefined
            ? [
                base.plan.beats.find((beat) => {
                  const start = beatStart(base.plan!, beat.id);
                  return (
                    row.edit.timestamp! >= start &&
                    row.edit.timestamp! <
                      start + (beat.durationInFrames ?? 180) / 30
                  );
                })?.id ?? base.plan.beats[0].id,
              ]
            : []);
      await stage(id, "Working out what needs to change", 8, "generating");
      if (row.settings.language !== base.settings.language) {
        plan = await director.translate(
          base.plan,
          row.settings.language,
          signal,
          async(done,total)=>{ await stage(id,`Translating text ${done} of ${total}`,8+Math.floor(done/total*24),"generating"); },
        );
      } else if (row.edit.duplicate) {
        plan = structuredClone(base.plan);
      } else {
        const edit = await director.revise(
          base.plan,
          `${row.request}${row.edit.answer ? `\nSelected section: ${row.edit.answer}` : ""}`,
          selected,
          signal,
        );
        if (edit.kind === "question") {
          await ask(
            row,
            edit.question ?? "Which section should I change?",
            edit.options.length
              ? edit.options
              : base.plan.beats.map((beat) => ({
                  label: beat.title,
                  value: beat.id,
                })),
          );
          return;
        }
        if (edit.kind === "full") {
          if (selected.length) {
            const selectedSeconds = base.plan.beats
              .filter((beat) => selected.includes(beat.id))
              .reduce(
                (sum, beat) => sum + (beat.durationInFrames ?? 180) / 30,
                0,
              );
            const replacement = await director.create(
              `${chat.prompt}
Revise ONLY these sections: ${base.plan.beats
                .filter((beat) => selected.includes(beat.id))
                .map((beat) => beat.narration)
                .join(" ")}
Requested change: ${row.request}`,
              {
                ...row.settings,
                duration: Math.max(
                  10,
                  Math.min(120, Math.round(selectedSeconds)),
                ),
              },
              signal,
            );
            plan = structuredClone(base.plan);
            let inserted = false;
            plan.beats = plan.beats.flatMap((beat) => {
              if (!selected.includes(beat.id)) return [beat];
              if (inserted) return [];
              inserted = true;
              return replacement.beats.map((item, index) => ({
                ...item,
                id: `revision-${index + 1}-${beat.id}`.slice(0, 31),
              }));
            });
          } else
            plan = await director.create(
              `${chat.prompt}
Requested revision: ${row.request}`,
              row.settings,
              signal,
            );
        } else {
          plan = applyDirectorEdit(base.plan, edit, selected);
          if (
            row.settings.duration === base.settings.duration &&
            !edit.replacementNarrations.length
          )
            row = await save(id, {
              timings: {
                ...row.timings,
                preserveDurationSeconds: planFrames(base.plan) / 30,
              },
            });
        }
        const changes = [
          edit.font ? `Typeface: ${edit.font}.` : "",
          edit.dimension
            ? `Converted ${edit.beatIds.length || selected.length ? "the selected sections" : "the visuals"} to ${edit.dimension.toUpperCase()}.`
            : "",
          edit.background ? "Updated the background." : "",
          edit.replacementVisuals.length
            ? `Rebuilt ${edit.replacementVisuals.length} visual section(s).`
            : "",
          edit.replacementNarrations.length || edit.kind === "full"
            ? "Reworked the explanation."
            : "Kept the original narration.",
          edit.sound ? "Updated the sound design." : "",
        ].filter(Boolean);
        row = await save(id, {
          edit: { ...row.edit, appliedChanges: changes },
        });
      }
      if (row.settings.voice !== base.settings.voice) {
        for (const beat of plan.beats) {
          delete beat.audioKey;
          delete beat.captionCues;
          delete beat.speechVerified;
          delete beat.audioDuration;
          delete beat.durationInFrames;
        }
      }
      plan.captions = row.settings.captions;
      row = await save(id, { plan, title: plan.title });
    }
    if (!plan) {
      const singlePass =
        row.intent !== "child" &&
        row.settings.coverage === "overview" &&
        typeof row.settings.duration === "number" &&
        row.settings.duration <= 120;
      if (row.intent !== "child" && !singlePass) {
        const assessment = await director.assess(
          `${row.request}${row.settings.context ? `\nAdditional context: ${row.settings.context}` : ""}${row.edit.answer ? `\nClarification: ${row.edit.answer}` : ""}`,
          row.settings,
          signal,
          sources,
        );
        await checkpoint("Planning your explanation", 10);
        row = await save(id, { title: assessment.title });
        if (assessment.clarification && !row.edit.answer) {
          await ask(
            row,
            assessment.clarification.question,
            assessment.clarification.options,
          );
          return;
        }
        if (
          assessment.estimatedDuration > 120 &&
          validChapterTotal(assessment.chapters)
        ) {
          row = await save(id, { outline: assessment.chapters });
          await ask(
            row,
            `Keeping the requested coverage needs about ${Math.round(assessment.estimatedDuration)} seconds. Shall I create these short chapters?`,
            [
              { label: "Generate all chapters", value: "chapters" },
              { label: "Make a single short overview", value: "overview" },
            ],
            "chapters",
          );
          return;
        }
      }
      await stage(
        id,
        "Writing the explanation and directing the visuals",
        15,
        "generating",
      );
      try {
        plan = await director.create(
          `${row.request}${row.settings.context ? `\nContext: ${row.settings.context}` : ""}${row.edit.answer ? `\nClarification: ${row.edit.answer}` : ""}`,
          ["kn", "te"].includes(row.settings.language)
            ? {...row.settings, language: "en"}
            : row.settings,
          signal,
          singlePass,
          sources,
        );
      } catch (error) {
        if (error instanceof ScopeQuestion) {
          await ask(row, error.question, error.options);
          return;
        }
        throw error;
      }
      await metric("plan_ready", { singlePass, beats: plan.beats.length });
      if (row.intent === "child") plan.title = row.title;
      if (row.settings.style === "spatial")
        plan.beats.forEach((beat) => {
          if (beat.visual.kind !== "code") beat.visual.dimension = "3d";
        });
      if (row.settings.sound === "off")
        plan.sound = { mood: "none", music: 0, effects: 0 };
      else if (plan.sound.mood === "none")
        plan.sound = {
          mood: /space|solar|universe/iu.test(row.request)
            ? "cinematic"
            : /workflow|refund|order|api|software/iu.test(row.request)
              ? "tech"
              : /story|history/iu.test(row.request)
                ? "calm"
                : "curious",
          music: 0.1,
          effects: 0.18,
        };
      row = await save(id, {
        plan,
        title: plan.title,
        timings: { ...row.timings, writingMs: Date.now() - started },
      });
    }
    // Persist the canonical plan before translating. A translation retry reuses
    // it and the per-field cache instead of repeating the full writing stage.
    if (plan.language !== row.settings.language) {
      await stage(id,"Translating narration and labels",25,"generating");
      plan = await director.translate(plan,row.settings.language,signal,async(done,total)=>{
        await stage(id,`Translating text ${done} of ${total}`,25+Math.floor(done/total*8),"generating");
      });
      row=await save(id,{plan});
    }
    // Repair obvious text-budget misses before paying for any speech inference.
    if (
      !plan.beats.some((beat) => beat.audioKey) &&
      plan.language === "en" &&
      typeof row.settings.duration === "number" &&
      row.settings.duration <= 120 &&
      !row.timings.preflightDone
    ) {
      const words = plan.beats.reduce(
          (sum, beat) => sum + beat.narration.trim().split(/\s+/u).length,
          0,
        ),
        target = row.settings.duration;
      if (words < target * 1.7 || words > target * 3.1) {
        await metric("duration_preflight", {
          words,
          target,
          estimatedSeconds: words / 2.65,
        });
        plan = await director.fitNarration(plan, target, words / 2.65, signal);
      }
      row = await save(id, {
        plan,
        timings: { ...row.timings, preflightDone: 1 },
      });
    }
    const groundingIssues = sourceGroundingIssues(plan, sources);
    if (groundingIssues.length)
      throw new HttpError(
        503,
        `The script did not explain the uploaded source accurately: ${groundingIssues[0]}`,
      );
    const voice = (await getVoices()).voices.find(
      (voice) =>
        voice.language === row.settings.language &&
        voice.gender === row.settings.voice &&
        voice.ready,
    );
    if (!voice)
      throw new HttpError(
        503,
        "The selected local voice is unavailable. Check the existing Indic Parler service.",
      );
    if (plan.beats.some((beat) => !beat.audioKey)) await releaseWriter(signal);
    const narrationStart = Date.now();
    const narrate = async (current: MotionPlan) => {
      for (const [index, beat] of current.beats.entries()) {
        signal.throwIfAborted();
        await stage(
          id,
          `Recording narration ${index + 1} of ${current.beats.length}`,
          35 + Math.floor((index / current.beats.length) * 23),
          "narrating",
        );
        let cached = !!beat.audioKey && !!beat.audioDuration;
        if (cached)
          try {
            await access(
              path.resolve(env.MEDIA_ROOT, "audio", `${beat.audioKey}.wav`),
            );
          } catch {
            cached = false;
          }
        if (!cached) {
          const speechStarted = Date.now();
          const audio = await synthesize(
            beat.narration,
            current.language,
            voice.id,
            1,
            signal,
          );
          await metric("synthesis", {
            beatId: beat.id,
            language: current.language,
            elapsedMs: Date.now() - speechStarted,
            audioSeconds: audio.durationSeconds,
            cached: audio.cached,
            telemetry: audio.telemetry,
            fitAttempt: row.edit.fitAttempts ?? 0,
          });
          beat.audioKey = audio.assetKey;
          beat.audioDuration = audio.durationSeconds;
          beat.captionCues = audio.captions;
          beat.speechVerified = audio.quality?.version;
        }
        if (cached)
          await metric("synthesis_cache", {
            beatId: beat.id,
            audioSeconds: beat.audioDuration,
          });
        beat.durationInFrames = Math.ceil(
          ((beat.audioDuration ?? 6) + 0.5) * 30,
        );
        row = await save(id, { plan: current });
      }
    };
    await narrate(plan);
    const explicit =
      typeof row.settings.duration === "number"
        ? Math.min(120, row.settings.duration)
        : null;
    const preserved = row.timings.preserveDurationSeconds;
    const target = preserved ?? explicit ?? 120;
    let fitAttempts = row.edit.fitAttempts ?? 0;
    const naturalSeconds = () =>
      plan!.beats.reduce(
        (sum, beat) => sum + (beat.audioDuration ?? 0) + 0.28,
        0,
      );
    while (
      !preserved &&
      fitAttempts < 2 &&
      (naturalSeconds() >
        (target - plan.beats.length * 0.28) * 1.18 + plan.beats.length * 0.28 ||
        (explicit !== null &&
          (naturalSeconds() - plan.beats.length * 0.28) / 0.85 +
            plan.beats.length * 0.28 <
            target * 0.8 - 0.5))
    ) {
      if (!explicit && row.settings.coverage !== "overview") break;
      fitAttempts++;
      await metric("duration_rewrite", {
        attempt: fitAttempts,
        naturalSeconds: naturalSeconds(),
        target,
        rejectedBeatIds: plan.beats.map((beat) => beat.id),
      });
      await stage(
        id,
        `Fitting the explanation to ${target} seconds (${fitAttempts}/2)`,
        58,
        "generating",
      );
      row = await save(id, { edit: { ...row.edit, fitAttempts } });
      const previousNarrations = plan.beats.map((beat) => beat.narration);
      plan = await director.fitNarration(
        plan,
        target,
        naturalSeconds(),
        signal,
      );
      const rewrittenIssues = sourceGroundingIssues(plan, sources);
      if (rewrittenIssues.length)
        throw new HttpError(
          503,
          `The timing rewrite lost source grounding: ${rewrittenIssues[0]}`,
        );
      row = await save(id, { plan });
      if (
        plan.beats.every(
          (beat, index) => beat.narration === previousNarrations[index],
        )
      ) {
        await metric("fitting_noop", { attempt: fitAttempts });
        break;
      }
      await releaseWriter(signal);
      await narrate(plan);
    }
    if (
      naturalSeconds() > 120 &&
      (!explicit ||
        naturalSeconds() / Math.max(1, explicit - plan.beats.length * 0.28) >
          1.18)
    ) {
      const groups: string[][] = [];
      let group: string[] = [],
        frames = 0;
      for (const beat of plan.beats) {
        if ((beat.durationInFrames ?? 0) > 3600)
          throw new HttpError(
            409,
            `“${beat.title}” still exceeds 120 seconds after two timing repairs. Please request a shorter explanation for that section.`,
          );
        if (frames + (beat.durationInFrames ?? 0) > 3600 && group.length) {
          groups.push(group);
          group = [];
          frames = 0;
        }
        group.push(beat.id);
        frames += beat.durationInFrames ?? 0;
      }
      if (group.length) groups.push(group);
      const outline = groups.map((ids, index) => ({
        title: `${index + 1}. ${plan!.beats.find((beat) => beat.id === ids[0])!.title}`,
        objective: plan!.beats
          .filter((beat) => ids.includes(beat.id))
          .map((beat) => beat.title)
          .join("; ")
          .slice(0, 600),
        estimatedDuration: Math.min(
          120,
          Math.ceil(
            plan!.beats
              .filter((beat) => ids.includes(beat.id))
              .reduce((sum, beat) => sum + (beat.durationInFrames ?? 0), 0) /
              30,
          ),
        ),
      }));
      row = await save(id, {
        plan,
        outline,
        edit: { ...row.edit, groupBeatIds: groups },
      });
      await ask(
        row,
        "The measured narration exceeds 120 seconds. I can preserve all the content as these chapters.",
        [
          { label: "Generate all chapters", value: "chapters" },
          { label: "Make a shorter overview", value: "overview" },
        ],
        "chapters",
      );
      return;
    }
    const desired =
      preserved ?? explicit ?? Math.min(120, Math.ceil(planFrames(plan) / 30));
    const rawSpeech = plan.beats.reduce(
      (sum, beat) => sum + (beat.audioDuration ?? 0),
      0,
    );
    // Reserve one frame per beat for independent ceil() rounding; otherwise
    // a mathematically exact tempo could overflow the target by 1–2 frames.
    const available = desired - plan.beats.length * (0.28 + 1 / 30);
    const currentMinimumFrames = plan.beats.reduce(
      (sum, beat) =>
        sum +
        Math.ceil(
          ((beat.audioDuration ?? 0) / (beat.audioPlaybackRate ?? 1) + 0.28) *
            30,
        ),
      0,
    );
    if (currentMinimumFrames > Math.round(desired * 30)) {
      const rate = rawSpeech / available;
      if (rate > 1.18) {
        await ask(
          row,
          `The narration needs ${Math.ceil(rawSpeech + plan.beats.length * 0.28)} seconds at a clear pace. Choose how to fit the video.`,
          [
            {
              label: `Keep ${Math.round(desired)} seconds and rewrite more concisely`,
              value: `timing:${Math.round(desired)}`,
            },
            {
              label: `Use ${Math.min(120, Math.ceil(rawSpeech + plan.beats.length * 0.28))} seconds`,
              value: `timing:${Math.min(120, Math.ceil(rawSpeech + plan.beats.length * 0.28))}`,
            },
          ],
        );
        return;
      }
      plan.beats.forEach((beat) => {
        beat.audioPlaybackRate = rate;
      });
    }
    if (
      !preserved &&
      explicit &&
      rawSpeech + plan.beats.length * 0.28 < desired * 0.8
    ) {
      const gentleRate = Math.max(
        0.85,
        Math.min(
          1,
          rawSpeech / Math.max(1, desired * 0.8 - plan.beats.length * 0.28),
        ),
      );
      plan.beats.forEach((beat) => {
        beat.audioPlaybackRate = gentleRate;
      });
      await metric("teaching_pace", {
        rate: gentleRate,
        spokenSeconds: rawSpeech / gentleRate,
        visualActionSeconds: desired - rawSpeech / gentleRate,
      });
    }
    plan = fitExactTimeline(plan, desired);
    row = await save(id, {
      plan,
      duration: Math.round((planFrames(plan) / 30) * 1000),
      timings: { ...row.timings, narrationMs: Date.now() - narrationStart },
    });
    await stage(
      id,
      "Your animated preview is ready. Rendering the download…",
      64,
      "rendering",
    );
    const renderStart = Date.now();
    const result = await renderExplanation({
      id,
      plan,
      scale: row.settings.resolution === "1080p" ? 1.5 : 1,
      signal,
      onProgress: async (name, progress) =>
        stage(id, name, progress, "rendering"),
    });
    await checkpoint("Video ready", 99);
    row = await save(id, {
      status: "ready",
      stage: "Your video is ready",
      progress: 100,
      duration: Math.round(result.duration * 1000),
      segmentKeys: result.segmentKeys,
      timings: {
        ...row.timings,
        exportHeight: row.settings.resolution === "1080p" ? 1080 : 720,
        renderMs: Date.now() - renderStart,
        totalMs: Date.now() - started,
      },
      errorMessage: null,
    });
    if (!row.collectionId)
      await db
        .update(conversation)
        .set({ title: row.title, updatedAt: new Date() })
        .where(
          and(
            eq(conversation.id, row.conversationId),
            eq(conversation.activeRevisionId, row.id),
            jobFence(),
          ),
        );
    if (row.edit.appliedChanges?.length) {
      await db.transaction(async (tx) => {
        const prior = await tx
          .select({ id: conversationMessage.id })
          .from(conversationMessage)
          .where(
            and(
              eq(conversationMessage.conversationId, row.conversationId),
              sql`${conversationMessage.content}->>'completedRevisionId'=${row.id}`,
            ),
          )
          .limit(1);
        if (!prior.length)
          await appendMessage(tx, row.conversationId, "assistant", "text", {
            text: row.edit.appliedChanges?.join(" "),
            completedRevisionId: row.id,
          });
      });
    }
    if (row.collectionId) await refreshCollection(row.collectionId);
  } catch (error) {
    if (!signal.aborted)
      try {
        await save(id, {
          status: "failed",
          stage: "Generation needs attention",
          errorMessage:
            error instanceof Error
              ? error.message.slice(0, 1500)
              : "The video could not be completed.",
        });
        if (row.collectionId) await refreshCollection(row.collectionId);
      } catch {}
    throw error;
  }
}
