import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { creationSettingsSchema } from "@drishya/contracts";
import { explanationRevision, generationJob, user } from "@drishya/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "../src/auth";
import { db, pool } from "../src/database";
import { env } from "../src/env";
import { validateAudio } from "../src/explanations/audio";
import { revisionDirectory } from "../src/explanations/render";
import { createConversation, generate } from "../src/explanations/service";

const run = randomUUID(),
  started = Date.now();
let userId = "",
  finished = false;
try {
  const busy = await db
    .select()
    .from(generationJob)
    .where(inArray(generationJob.status, ["queued", "running", "retrying"]));
  assert.equal(busy.length, 0, "Benchmark only on idle queue");
  const signed = await auth.api.signUpEmail({
    body: {
      name: "Generation benchmark",
      email: `benchmark-${run}@example.invalid`,
      password: `Benchmark-${run}!`,
    },
  });
  userId = signed.user.id;
  const chat = await createConversation(
    userId,
    process.env.BENCHMARK_PROMPT ??
      "Explain how a web browser requests a page from a server and displays the response, for a beginner.",
    run,
  );
  await generate(
    userId,
    chat.conversation.id,
    creationSettingsSchema.parse({
      duration: 30,
      resolution: "720p",
      sound: "auto",
      style: "graphic",
    }),
    randomUUID(),
  );
  let previewMs: number | undefined;
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    const [row] = await db
      .select()
      .from(explanationRevision)
      .where(eq(explanationRevision.conversationId, chat.conversation.id));
    if (row?.status === "rendering" && !previewMs) {
      previewMs = Date.now() - row.createdAt.getTime();
      console.info("Playable preview", previewMs);
    }
    if (
      row?.status === "ready" ||
      row?.status === "failed" ||
      row?.status === "awaiting_input"
    ) {
      const [job] = await db
        .select()
        .from(generationJob)
        .where(eq(generationJob.resourceId, row.id));
      if (job?.status !== "completed" && row.status === "ready") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      finished = true;
      const directory = path.resolve(env.MEDIA_ROOT, "v2", "benchmarks", run);
      await mkdir(directory, { recursive: true });
      const events = job
        ? await readFile(
            path.resolve(env.MEDIA_ROOT, "v2", "metrics", `${job.id}.jsonl`),
            "utf8",
          ).catch(() => "")
        : "";
      const report = {
        run,
        revisionId: row.id,
        jobId: job?.id,
        status: row.status,
        error: row.errorMessage,
        previewMs,
        wallMs: job
          ? Date.now() - job.createdAt.getTime()
          : Date.now() - started,
        timings: row.timings,
        fitAttempts: row.edit.fitAttempts ?? 0,
        events: events
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      };
      await writeFile(
        path.join(directory, "report.json"),
        JSON.stringify(report, null, 2),
      );
      console.info(JSON.stringify(report, null, 2));
      await writeFile(
        path.join(directory, "plan.json"),
        JSON.stringify(row.plan, null, 2),
      );
      assert.equal(row.status, "ready", row.errorMessage ?? row.stage);
      await validateAudio(
        path.join(revisionDirectory(row.id), "video.mp4"),
        30,
        true,
      );
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
} finally {
  // Generated media/telemetry stay available locally for review; disposable login is removed.
  if (userId && finished) await db.delete(user).where(eq(user.id, userId));
  await pool.end();
}
