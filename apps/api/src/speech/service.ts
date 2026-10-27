import {
  LOCALIZATION_VERSION,
  OllamaLocalizer,
  PlannerError,
} from "@drishya/ai";
import {
  type LocalizedStoryboard,
  localizationIssues,
  localizedStoryboardSchema,
  narrationLanguageSchema,
  type SceneAudio,
  type VoiceoverRequest,
  voiceoverSchema,
} from "@drishya/contracts";
import { voiceover } from "@drishya/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import { env } from "../env";
import { HttpError } from "../http-error";
import { reserveModel } from "../model-gate";
import { getVersion } from "../storyboards/service";
import { getVoices, synthesize } from "./client";

const localizer = new OllamaLocalizer({
  baseURL: env.OLLAMA_BASE_URL,
  model: env.OLLAMA_MODEL,
  timeoutMs: env.OLLAMA_TIMEOUT_MS,
});
let controller: AbortController | null = null;
let activeRun: Promise<void> | null = null;
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
) {
  const release = reserveModel();
  try {
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
    const [record] = await db
      .insert(voiceover)
      .values({
        lessonVersionId: versionId,
        parentId,
        language: input.language,
        voiceId: voice.id,
        voiceLabel: voice.label,
        speed: String(input.speed),
        origin: edited ? "edited" : "generated",
        status: content ? "synthesizing" : "localizing",
        content,
        totalScenes: lesson.content.scenes.length,
        translationModel,
      })
      .returning();
    if (!record) throw new HttpError(500, "Could not start a voiceover.");
    controller = new AbortController();
    activeRun = run(record, lesson.content, controller.signal).finally(() => {
      release();
      controller = null;
      activeRun = null;
    });
    return serialize(record);
  } catch (error) {
    release();
    throw error;
  }
}

async function run(
  record: typeof voiceover.$inferSelect,
  canonical: NonNullable<Awaited<ReturnType<typeof getVersion>>["content"]>,
  signal: AbortSignal,
) {
  try {
    let content = record.content;
    if (!content) {
      if (record.language === "en")
        content = localizedStoryboardSchema.parse(canonical);
      else if (record.language !== "mr")
        content = await localizer.localize(canonical, record.language, signal);
      else
        throw new HttpError(
          400,
          "Marathi takes from the previous provider are playback-only. Choose English, Hindi, Kannada or Telugu for new narration.",
        );
    }
    await db
      .update(voiceover)
      .set({ content, status: "synthesizing" })
      .where(eq(voiceover.id, record.id));
    const audio: SceneAudio[] = [];
    for (const scene of content.scenes) {
      if (signal.aborted)
        throw new HttpError(
          409,
          "Narration was interrupted by an API restart. Retry this voiceover.",
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
        .where(eq(voiceover.id, record.id));
    }
    await db
      .update(voiceover)
      .set({ status: "ready" })
      .where(eq(voiceover.id, record.id));
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
        .where(eq(voiceover.id, record.id));
    } catch {
      console.error(
        `Unable to persist voiceover failure for take ${record.id}.`,
      );
    }
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
export async function recoverInterruptedVoiceovers() {
  await db
    .update(voiceover)
    .set({
      status: "failed",
      errorMessage:
        "The API restarted. Generate another take; unchanged scene audio can be reused.",
    })
    .where(inArray(voiceover.status, ["localizing", "synthesizing"]));
}
export async function stopVoiceovers() {
  controller?.abort();
  await activeRun;
}
