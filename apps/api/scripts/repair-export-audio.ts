import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { motionPlanSchema, planFrames } from "@drishya/contracts";
import { conversation, explanationRevision } from "@drishya/db/schema";
import { desc, eq } from "drizzle-orm";
import { db, pool } from "../src/database";
import {
  AUDIO_PIPELINE_VERSION,
  buildAudioTrack,
  mediaProbe,
  muxVerifiedAudio,
  validateAudio,
} from "../src/explanations/audio";
import { revisionDirectory } from "../src/explanations/render";

// Repairs only invalid exports owned by this chat's user, preserving the original files.
try {
  const [chat] = await db
    .select()
    .from(conversation)
    .where(
      eq(
        conversation.id,
        process.argv[2] ?? "3c2c249a-9777-46b3-bb8c-c4b52f4c8a53",
      ),
    );
  if (!chat) throw new Error("Chat not found");
  const rows = (
    await db
      .select({ revision: explanationRevision })
      .from(explanationRevision)
      .innerJoin(
        conversation,
        eq(explanationRevision.conversationId, conversation.id),
      )
      .where(eq(conversation.userId, chat.userId))
      .orderBy(desc(explanationRevision.createdAt))
      .limit(40)
  ).map((item) => item.revision);
  for (const row of rows) {
    if (row.status !== "ready" || !row.plan || row.collectionId === row.id)
      continue;
    const directory = revisionDirectory(row.id),
      video = path.join(directory, "video.mp4");
    try {
      await access(video);
    } catch {
      continue;
    }
    const plan = motionPlanSchema.parse(row.plan),
      duration = planFrames(plan) / 30,
      signal = AbortSignal.timeout(180000);
    try {
      await validateAudio(video, duration, true, signal);
      console.info("Healthy", row.id, row.title);
      continue;
    } catch (error) {
      console.info("Repairing", row.id, row.title, String(error));
    }
    const work = path.join(directory, `audio-repair-${Date.now()}`);
    await mkdir(work, { recursive: true });
    const { track } = await buildAudioTrack(plan, work, signal),
      repaired = path.join(work, "repaired.mp4");
    const audioVerification = await muxVerifiedAudio(
      video,
      track,
      repaired,
      duration,
      signal,
    );
    await copyFile(video, path.join(work, "original.mp4"));
    await rename(repaired, video);
    const manifestFile = path.join(directory, "manifest.json");
    let manifest: Record<string, unknown> = {};
    try {
      manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    } catch {}
    await writeFile(
      manifestFile,
      JSON.stringify(
        {
          ...manifest,
          audioPipeline: AUDIO_PIPELINE_VERSION,
          audioVerification,
          probe: await mediaProbe(video, signal),
        },
        null,
        2,
      ),
    );
    console.info("Repaired", row.id, audioVerification);
  }
} finally {
  await pool.end();
}
