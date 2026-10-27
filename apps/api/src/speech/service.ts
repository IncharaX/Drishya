import {
  LOCALIZATION_VERSION,
  OllamaLocalizer,
  OllamaNarrationFitter,
  PlannerError,
} from "@drishya/ai";
import {
  buildTimeline,
  type LocalizedStoryboard,
  localizationIssues,
  localizedStoryboardSchema,
  narrationLanguageSchema,
  type SceneAudio,
  type VoiceoverRequest,
  voiceoverSchema,
} from "@drishya/contracts";
import { voiceover, lessonVersion } from "@drishya/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import { env } from "../env";
import { HttpError } from "../http-error";
import { enqueue } from "../jobs/queue";
import { checkpoint, jobFence, saveFitting } from "../jobs/context";
import { getVersion } from "../storyboards/service";
import { getVoices, synthesize } from "./client";

import { probeAudio } from "../video/render";

const localizer = new OllamaLocalizer({
  baseURL: env.OLLAMA_BASE_URL,
  model: env.OLLAMA_MODEL,
  timeoutMs: env.OLLAMA_TIMEOUT_MS,
});
const fitter = new OllamaNarrationFitter({
  baseURL: env.OLLAMA_BASE_URL,
  model: env.OLLAMA_MODEL,
  timeoutMs: env.OLLAMA_TIMEOUT_MS,
});
function serialize(record: typeof voiceover.$inferSelect) {
  return voiceoverSchema.parse({
    ...record,
    speed: Number(record.speed),
    completedScenes: record.audio.length,
    createdAt: record.createdAt.toISOString(),
  });
}
export async function listVoiceovers(
  userId: string,
  projectId: string,
  chapterId: string,
  versionId: string,
) {
  await getVersion(userId, projectId, chapterId, versionId);
  const takes = await db
    .select()
    .from(voiceover)
    .where(eq(voiceover.lessonVersionId, versionId))
    .orderBy(desc(voiceover.createdAt))
    .limit(20);
  return { takes: takes.map(serialize) };
}
export async function getVoiceover(
  userId: string,
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
) {
  await getVersion(userId, projectId, chapterId, versionId);
  const [record] = await db
    .select()
    .from(voiceover)
    .where(
      and(eq(voiceover.id, takeId), eq(voiceover.lessonVersionId, versionId)),
    );
  if (!record) throw new HttpError(404, "Voiceover not found.");
  return serialize(record);
}
export async function startVoiceover(
  userId: string,
  projectId: string,
  chapterId: string,
  versionId: string,
  input: VoiceoverRequest,
  parentId?: string,
  edited?: LocalizedStoryboard,
  fitting?: {
    target: number;
    duration: number;
    attempts?: number;
    pendingSynthesis?: boolean;
  },
) {
  const lesson = await getVersion(userId, projectId, chapterId, versionId);
  if (lesson.status !== "ready" || !lesson.content)
    throw new HttpError(
      409,
      "Save a ready storyboard before creating narration.",
    );
  if (lesson.isStale)
    throw new HttpError(
      409,
      "The chapter changed. Generate a fresh storyboard before creating new audio.",
    );
  const voice = (await getVoices()).voices.find(
    (item) => item.id === input.voiceId && item.language === input.language,
  );
  if (!voice?.ready)
    throw new HttpError(
      409,
      voice?.reason ?? "Choose an available voice for this language.",
    );
  const translationModel =
    input.language === "en"
      ? "identity"
      : `${env.OLLAMA_MODEL}:${LOCALIZATION_VERSION}`;
  let content: LocalizedStoryboard | null = edited ?? null;
  if (edited) {
    const issues = localizationIssues(lesson.content, edited);
    if (issues.length) throw new HttpError(400, issues.join(" "));
  } else if (input.language === "en")
    content = localizedStoryboardSchema.parse(lesson.content);
  else {
    const [cached] = await db
      .select()
      .from(voiceover)
      .where(
        and(
          eq(voiceover.lessonVersionId, versionId),
          eq(voiceover.language, input.language),
          eq(voiceover.translationModel, translationModel),
          inArray(voiceover.status, ["ready", "failed"]),
        ),
      )
      .orderBy(desc(voiceover.createdAt))
      .limit(1);
    if (cached?.content) content = cached.content;
  }
  const record = await db.transaction(async (tx) => {
    const [record] = await tx
      .insert(voiceover)
      .values({
        lessonVersionId: versionId,
        parentId,
        language: input.language,
        voiceId: voice.id,
        voiceLabel: voice.label,
        speed: String(input.speed),
        origin: edited ? "edited" : "generated",
        status: fitting ? "fitting" : content ? "synthesizing" : "localizing",
        content,
        totalScenes: lesson.content?.scenes.length ?? 0,
        translationModel,
      })
      .returning();
    if (!record) throw new HttpError(500, "Could not start a voiceover.");
    await enqueue(tx, {
      userId,
      projectId,
      chapterId,
      kind: "voiceover",
      resourceId: record.id,
      payload: fitting ? { fitting } : {},
    });
    return record;
  });
  return serialize(record);
}

async function run(
  record: typeof voiceover.$inferSelect,
  canonical: NonNullable<Awaited<ReturnType<typeof getVersion>>["content"]>,
  signal: AbortSignal,
  fitting?: {
    target: number;
    duration: number;
    attempts?: number;
    pendingSynthesis?: boolean;
  },
) {
  try {
    let content = record.content;
    if (!content) {
      if (record.language === "en")
        content = localizedStoryboardSchema.parse(canonical);
      else if (record.language !== "mr") {
        const [sourceVersion] = await db
          .select()
          .from(lessonVersion)
          .where(eq(lessonVersion.id, record.lessonVersionId));
        const [cached] = sourceVersion
          ? await db
              .select({
                canonical: lessonVersion.content,
                localized: voiceover.content,
              })
              .from(voiceover)
              .innerJoin(
                lessonVersion,
                eq(voiceover.lessonVersionId, lessonVersion.id),
              )
              .where(
                and(
                  eq(lessonVersion.chapterId, sourceVersion.chapterId),
                  eq(voiceover.language, record.language),
                  eq(voiceover.translationModel, record.translationModel),
                  eq(voiceover.origin, "generated"),
                  eq(voiceover.status, "ready"),
                ),
              )
              .orderBy(desc(voiceover.createdAt))
              .limit(1)
          : [];
        content = await localizer.localize(
          canonical,
          record.language,
          signal,
          cached?.canonical && cached.localized
            ? { canonical: cached.canonical, localized: cached.localized }
            : undefined,
        );
      } else
        throw new HttpError(
          400,
          "Marathi takes from the previous provider are playback-only. Choose English, Hindi, Kannada or Telugu for new narration.",
        );
    }
    let measuredDuration = fitting?.duration ?? 0;
    for (
      let attempt = fitting?.pendingSynthesis
        ? Math.max(0, (fitting.attempts ?? 1) - 1)
        : (fitting?.attempts ?? 0);
      attempt < (fitting ? 2 : 1);
      attempt++
    ) {
      if (fitting && !fitting.pendingSynthesis) {
        await checkpoint(`Shortening narration (attempt ${attempt + 1}/2)`, 10);
        fitting.attempts = attempt + 1;
        await saveFitting(fitting);
        await db
          .update(voiceover)
          .set({ status: "fitting", audio: [] })
          .where(and(eq(voiceover.id, record.id), jobFence()));
        const speechBudget =
          fitting.target - canonical.scenes.length * (16 / 24) - 1;
        content = await fitter.shorten(
          content,
          record.language,
          Math.max(
            0.25,
            Math.min(0.85, (speechBudget / measuredDuration) * 0.9),
          ),
          signal,
        );
      }
      await db
        .update(voiceover)
        .set({ content, status: "synthesizing" })
        .where(and(eq(voiceover.id, record.id), jobFence()));
      if (fitting) {
        fitting.pendingSynthesis = true;
        await saveFitting(fitting);
      }
      const audio: SceneAudio[] = [];
      for (const [sceneIndex, scene] of content.scenes.entries()) {
        await checkpoint(
          `Synthesizing scene ${sceneIndex + 1}/${content.scenes.length}`,
          20 + Math.floor((65 * sceneIndex) / content.scenes.length),
        );
        if (signal.aborted)
          throw new HttpError(
            409,
            "Narration was interrupted. Saved inputs and cached audio can be reused on retry.",
          );
        const asset = await synthesize(
          scene.narration,
          record.language,
          record.voiceId,
          Number(record.speed),
          signal,
        );
        audio.push({ sceneId: scene.id, ...asset });
        await db
          .update(voiceover)
          .set({ audio })
          .where(and(eq(voiceover.id, record.id), jobFence()));
      }

      if (!fitting) break;
      const measured: SceneAudio[] = [];
      for (const asset of audio)
        measured.push({
          ...asset,
          ...(await probeAudio(asset.assetKey, signal)),
        });
      measuredDuration = measured.reduce(
        (sum, asset) => sum + asset.durationSeconds,
        0,
      );
      fitting.pendingSynthesis = false;
      fitting.duration = measuredDuration;
      await saveFitting(fitting);
      try {
        buildTimeline(content, measured, fitting.target);
        break;
      } catch {
        if (attempt === 1)
          throw new HttpError(
            409,
            "Narration still exceeds the chapter target after two shortening attempts. Edit the original take's narration or split the chapter into smaller objectives; no audio was cut or accelerated.",
            "DURATION_EXCEEDED",
          );
      }
    }
    if (fitting && !fitting.pendingSynthesis && (fitting.attempts ?? 0) >= 2) {
      const [saved] = await db
        .select()
        .from(voiceover)
        .where(eq(voiceover.id, record.id));
      try {
        buildTimeline(content, saved?.audio ?? [], fitting.target);
      } catch {
        throw new HttpError(
          409,
          "The two shortening attempts have been used. Edit the original narration or split the chapter.",
          "DURATION_EXCEEDED",
        );
      }
    }
    await checkpoint("Saving narration", 95);
    await db
      .update(voiceover)
      .set({ status: "ready" })
      .where(and(eq(voiceover.id, record.id), jobFence()));
  } catch (error) {
    try {
      await db
        .update(voiceover)
        .set({
          status: "failed",
          errorMessage:
            error instanceof HttpError || error instanceof PlannerError
              ? error.message
              : "The narration could not be saved. Check local inference and database connectivity, then retry.",
        })
        .where(and(eq(voiceover.id, record.id), jobFence()));
    } catch {
      console.error(
        `Unable to persist voiceover failure for take ${record.id}.`,
      );
    }
    throw error;
  }
}
export async function reviseVoiceover(
  userId: string,
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
  content: LocalizedStoryboard,
) {
  const parent = await getVoiceover(
    userId,
    projectId,
    chapterId,
    versionId,
    takeId,
  );
  if (parent.status !== "ready")
    throw new HttpError(
      409,
      "Wait for a ready voiceover before editing narration.",
    );
  const language = narrationLanguageSchema.safeParse(parent.language);
  if (!language.success || !parent.voiceId.startsWith("indic-parler-"))
    throw new HttpError(
      409,
      "This is a legacy voiceover. Generate a new Indic Parler take in a supported language before editing.",
    );
  return startVoiceover(
    userId,
    projectId,
    chapterId,
    versionId,
    { language: language.data, voiceId: parent.voiceId, speed: 1 },
    parent.id,
    content,
  );
}

export async function fitVoiceover(
  userId: string,
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
) {
  const parent = await getVoiceover(
    userId,
    projectId,
    chapterId,
    versionId,
    takeId,
  );
  const lesson = await getVersion(userId, projectId, chapterId, versionId);
  const language = narrationLanguageSchema.safeParse(parent.language);
  if (
    parent.status !== "ready" ||
    !parent.content ||
    !language.success ||
    !parent.voiceId.startsWith("indic-parler-")
  )
    throw new HttpError(
      409,
      "Choose a ready Indic Parler take before shortening narration.",
    );
  const signal = AbortSignal.timeout(30_000);
  const audio: SceneAudio[] = [];
  for (const asset of parent.audio)
    audio.push({ ...asset, ...(await probeAudio(asset.assetKey, signal)) });
  try {
    buildTimeline(
      parent.content,
      audio,
      lesson.input.request.targetDurationSeconds,
    );
  } catch {
    return startVoiceover(
      userId,
      projectId,
      chapterId,
      versionId,
      { language: language.data, voiceId: parent.voiceId, speed: 1 },
      parent.id,
      parent.content,
      {
        target: lesson.input.request.targetDurationSeconds,
        duration: audio.reduce((sum, asset) => sum + asset.durationSeconds, 0),
      },
    );
  }
  throw new HttpError(
    409,
    "This narration already fits the target; export it directly.",
  );
}

export async function executeVoiceover(
  id: string,
  signal: AbortSignal,
  fitting?: {
    target: number;
    duration: number;
    attempts?: number;
    pendingSynthesis?: boolean;
  },
) {
  const [record] = await db
    .select()
    .from(voiceover)
    .where(eq(voiceover.id, id));
  if (!record) throw new HttpError(404, "Voiceover no longer exists.");
  if (record.status === "ready") return;
  const [lesson] = await db
    .select()
    .from(lessonVersion)
    .where(eq(lessonVersion.id, record.lessonVersionId));
  if (!lesson?.content)
    throw new HttpError(409, "The source storyboard is unavailable.");
  if (fitting && record.content && record.audio.length === record.totalScenes) {
    const measured: SceneAudio[] = [];
    for (const asset of record.audio)
      measured.push({
        ...asset,
        ...(await probeAudio(asset.assetKey, signal)),
      });
    try {
      buildTimeline(record.content, measured, fitting.target);
      await checkpoint("Restoring completed narration", 95);
      await db
        .update(voiceover)
        .set({ status: "ready", errorMessage: null })
        .where(and(eq(voiceover.id, id), jobFence()));
      return;
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  await db
    .update(voiceover)
    .set({
      status: fitting
        ? "fitting"
        : record.content
          ? "synthesizing"
          : "localizing",
      errorMessage: null,
    })
    .where(and(eq(voiceover.id, id), jobFence()));
  await checkpoint(
    record.content ? "Resuming narration" : "Localizing lesson",
    5,
  );
  await run(record, lesson.content, signal, fitting);
}
