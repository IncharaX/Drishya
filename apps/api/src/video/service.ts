import {
  buildTimeline,
  type Timeline,
  VIDEO_PROFILE,
  voiceoverSchema,
  type Voiceover,
  videoExportSchema,
} from "@drishya/contracts";
import { videoExport, voiceover, lessonVersion } from "@drishya/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import { HttpError } from "../http-error";
import { getVoiceover } from "../speech/service";
import { getVersion } from "../storyboards/service";
import {
  checkRenderer,
  completeVideo,
  probeAudio,
  renderVideo,
} from "./render";

import { enqueue } from "../jobs/queue";
import { checkpoint, jobFence } from "../jobs/context";
const serialize = (record: typeof videoExport.$inferSelect) =>
  videoExportSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
  });
export async function measuredTimeline(
  take: Voiceover,
  target: number,
  signal: AbortSignal,
): Promise<Timeline> {
  if (take.status !== "ready" || !take.content)
    throw new HttpError(
      409,
      "Generate a complete narration take before exporting.",
    );
  const audio = [];
  for (const asset of take.audio)
    audio.push({ ...asset, ...(await probeAudio(asset.assetKey, signal)) });
  try {
    return buildTimeline(take.content, audio, target);
  } catch (error) {
    throw new HttpError(
      409,
      error instanceof Error
        ? error.message
        : "Narration does not fit the chapter target.",
      "DURATION_EXCEEDED",
    );
  }
}
export async function listExports(
  userId: string,
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
) {
  await getVoiceover(userId, projectId, chapterId, versionId, takeId);
  const records = await db
    .select()
    .from(videoExport)
    .where(eq(videoExport.voiceoverId, takeId))
    .orderBy(desc(videoExport.createdAt))
    .limit(10);
  return { exports: records.map(serialize) };
}
export async function getExport(
  userId: string,
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
  exportId: string,
) {
  await getVoiceover(userId, projectId, chapterId, versionId, takeId);
  const [record] = await db
    .select()
    .from(videoExport)
    .where(
      and(eq(videoExport.id, exportId), eq(videoExport.voiceoverId, takeId)),
    );
  if (!record) throw new HttpError(404, "Video export not found.");
  return serialize(record);
}
export async function startExport(
  userId: string,
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
) {
  const lesson = await getVersion(userId, projectId, chapterId, versionId);
  const take = await getVoiceover(
    userId,
    projectId,
    chapterId,
    versionId,
    takeId,
  );
  if (lesson.isStale)
    throw new HttpError(
      409,
      "The chapter changed. Generate a fresh storyboard and narration first.",
    );
  if (take.status !== "ready" || !take.content)
    throw new HttpError(
      409,
      "Generate a complete narration take before exporting.",
    );
  const [cached] = await db
    .select()
    .from(videoExport)
    .where(
      and(
        eq(videoExport.voiceoverId, takeId),
        eq(videoExport.status, "ready"),
        eq(videoExport.profile, VIDEO_PROFILE.version),
      ),
    )
    .orderBy(desc(videoExport.createdAt))
    .limit(1);
  if (
    cached?.timeline &&
    (await completeVideo(cached.id, cached.timeline, take.language))
  )
    return serialize(cached);
  await checkRenderer();
  const record = await db.transaction(async (tx) => {
    const [record] = await tx
      .insert(videoExport)
      .values({
        voiceoverId: takeId,
        status: "preparing",
        profile: VIDEO_PROFILE.version,
      })
      .returning();
    if (!record) throw new HttpError(500, "Could not save a video export.");
    await enqueue(tx, {
      userId,
      projectId,
      chapterId,
      kind: "video",
      resourceId: record.id,
    });
    return record;
  });
  return serialize(record);
}
async function run(
  record: typeof videoExport.$inferSelect,
  take: Voiceover,
  target: number,
  signal: AbortSignal,
) {
  try {
    if (!take.content)
      throw new HttpError(409, "This take has no narration content.");
    const timeline = await measuredTimeline(take, target, signal);
    await db
      .update(videoExport)
      .set({ timeline, status: "rendering", progress: 3 })
      .where(and(eq(videoExport.id, record.id), jobFence()));
    if (!(await completeVideo(record.id, timeline, take.language)))
      await renderVideo({
        id: record.id,
        content: take.content,
        timeline,
        language: take.language,
        signal,
        onProgress: async (progress) => {
          await checkpoint(
            progress < 80 ? "Rendering video" : "Encoding MP4",
            progress,
          );
          await db
            .update(videoExport)
            .set({ progress })
            .where(and(eq(videoExport.id, record.id), jobFence()));
        },
      });
    await db
      .update(videoExport)
      .set({ status: "ready", progress: 100 })
      .where(and(eq(videoExport.id, record.id), jobFence()));
  } catch (error) {
    console.error(`Video export ${record.id} failed:`, error);
    try {
      await db
        .update(videoExport)
        .set({
          status: "failed",
          errorMessage:
            error instanceof HttpError
              ? error.message
              : signal.aborted
                ? "Export interrupted. Your storyboard and narration are saved; retry the export."
                : error instanceof Error
                  ? `Video rendering failed: ${error.message.slice(0, 1200)}`
                  : "Video rendering failed unexpectedly. Check the API logs for details.",
        })
        .where(and(eq(videoExport.id, record.id), jobFence()));
    } catch {
      console.error(`Could not persist video export failure ${record.id}`);
    }
    throw error;
  }
}

export async function executeVideo(id: string, signal: AbortSignal) {
  const [record] = await db
    .select()
    .from(videoExport)
    .where(eq(videoExport.id, id));
  if (!record) throw new HttpError(404, "Export no longer exists.");
  if (record.status === "ready") return;
  const [takeRecord] = await db
    .select()
    .from(voiceover)
    .where(eq(voiceover.id, record.voiceoverId));
  if (!takeRecord)
    throw new HttpError(404, "Source narration no longer exists.");
  const [lesson] = await db
    .select()
    .from(lessonVersion)
    .where(eq(lessonVersion.id, takeRecord.lessonVersionId));
  if (!lesson) throw new HttpError(404, "Source storyboard no longer exists.");
  const take = voiceoverSchema.parse({
    ...takeRecord,
    speed: Number(takeRecord.speed),
    completedScenes: takeRecord.audio.length,
    createdAt: takeRecord.createdAt.toISOString(),
  });
  await db
    .update(videoExport)
    .set({ status: "preparing", errorMessage: null })
    .where(and(eq(videoExport.id, id), jobFence()));
  await checkpoint("Measuring narration", 2);
  await run(record, take, lesson.input.request.targetDurationSeconds, signal);
}
