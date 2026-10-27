import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  generationJob,
  project,
  user,
  chapter,
  lessonVersion,
} from "@drishya/db/schema";
import { and, eq } from "drizzle-orm";
import { app } from "../src/app";
import type { Server } from "node:http";
import { auth } from "../src/auth";
import { db, pool } from "../src/database";
import { env } from "../src/env";
import { jobContext, jobFence } from "../src/jobs/context";
import { cancelJob, enqueue, listJobs, retryJob } from "../src/jobs/queue";

// Isolated local database only. No LLM/TTS calls or cloud data modifications.
assert.equal(env.APP_PROFILE, "offline");
assert.equal(new URL(env.DATABASE_URL).port, "55432");
const id = randomUUID(),
  email = `queue-${id}@example.invalid`,
  password = `Local-test-${randomUUID()}`;
let worker: ReturnType<typeof spawn> | undefined;
let server: Server | undefined;
try {
  const signup = await auth.api.signUpEmail({
    body: { name: "Local queue verification", email, password },
    asResponse: true,
  });
  assert.equal(signup.status, 200);
  const signed = await signup.json();
  const userId = signed.user.id as string;
  const cookies = signup.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert.ok(cookies.includes("drishya-offline"));
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: cookies }),
  });
  assert.equal(session?.user.id, userId);
  const makeProject = async () => {
    const [record] = await db
      .insert(project)
      .values({
        userId,
        title: "Durability verification",
        request: {
          topic: "Verification",
          language: "en",
          level: "beginner",
          approach: "lesson",
          targetDurationSeconds: 30,
        },
        status: "ready",
        model: "verification-no-inference",
      })
      .returning();
    return record;
  };
  const first = await makeProject(),
    second = await makeProject();
  const [chapterRow] = await db
    .insert(chapter)
    .values({
      projectId: first.id,
      title: "Library verification",
      objective: "Verify saved lesson metadata.",
      position: 0,
      estimatedDurationSeconds: 30,
      prerequisites: [],
    })
    .returning();
  const [version] = await db
    .insert(lessonVersion)
    .values({
      chapterId: chapterRow.id,
      version: 1,
      origin: "generated",
      status: "drafting",
      input: {
        request: first.request,
        interpretedSubject: "Verification",
        chapter: {
          title: chapterRow.title,
          objective: chapterRow.objective,
          estimatedDurationSeconds: 30,
          prerequisites: [],
        },
      },
      inputFingerprint: "verification",
      references: [],
      model: "verification-no-inference",
    })
    .returning();
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(`${base}/api/projects/jobs`)).status, 401);
  const libraryResponse = await fetch(`${base}/api/projects/library`, {
    headers: { cookie: cookies },
  });
  assert.equal(libraryResponse.status, 200);
  const library = await libraryResponse.json();
  assert.equal(library.items[0].versionId, version.id);
  assert.equal(library.items[0].takeId, null);
  await db.transaction((tx) =>
    enqueue(tx, {
      userId,
      projectId: first.id,
      kind: "plan",
      resourceId: first.id,
    }),
  );
  let jobs = await listJobs(userId);
  assert.equal(jobs.jobs.length, 1);
  assert.equal(jobs.jobs[0].status, "queued");
  await assert.rejects(cancelJob("unrelated-user", jobs.jobs[0].id));
  await cancelJob(userId, jobs.jobs[0].id);
  jobs = await listJobs(userId);
  assert.equal(jobs.jobs[0].status, "cancelled");
  const [preserved] = await db
    .select()
    .from(project)
    .where(eq(project.id, first.id));
  assert.equal(
    preserved.status,
    "ready",
    "Cancellation cannot discard already committed output",
  );
  await retryJob(userId, jobs.jobs[0].id);
  const token = randomUUID();
  const [expired] = await db
    .insert(generationJob)
    .values({
      userId,
      projectId: second.id,
      kind: "plan",
      resourceId: second.id,
      status: "running",
      lockToken: token,
      leaseUntil: new Date(Date.now() - 1000),
      attempts: 1,
      stage: "Interrupted worker",
    })
    .returning();
  // A stale worker may not mutate a resource after its lease has expired.
  const controller = new AbortController();
  await jobContext.run(
    {
      id: expired.id,
      token,
      signal: controller.signal,
      report: async () => {},
      saveFitting: async () => {},
    },
    async () => {
      await db
        .update(generationJob)
        .set({ leaseUntil: new Date(Date.now() + 90_000) })
        .where(eq(generationJob.id, expired.id));
      const permitted = await db
        .update(project)
        .set({ title: "Permitted lease write" })
        .where(and(eq(project.id, second.id), jobFence()))
        .returning();
      assert.equal(permitted.length, 1);
      await db
        .update(generationJob)
        .set({ leaseUntil: new Date(Date.now() - 1000) })
        .where(eq(generationJob.id, expired.id));
      const changed = await db
        .update(project)
        .set({ title: "Must not write" })
        .where(and(eq(project.id, second.id), jobFence()))
        .returning();
      assert.equal(changed.length, 0);
    },
  );
  worker = spawn(process.execPath, ["--import", "tsx", "src/jobs/worker.ts"], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  worker.stdout?.on("data", (chunk) => (output += chunk));
  worker.stderr?.on("data", (chunk) => (output += chunk));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    jobs = await listJobs(userId);
    if (jobs.jobs.every((job) => job.status === "completed")) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(
    jobs.jobs.every((job) => job.status === "completed"),
    `Worker must recover queued and expired jobs: ${output}`,
  );
  assert.equal(jobs.jobs.find((job) => job.id === expired.id)?.attempts, 2);
  assert.equal(
    jobs.jobs.find((job) => job.resourceId === first.id)?.attempts,
    1,
  );
  const [limit] = await db
    .insert(generationJob)
    .values({
      userId,
      projectId: first.id,
      kind: "plan",
      resourceId: first.id,
      status: "failed",
      attempts: 3,
      maxAttempts: 3,
      stage: "Exhausted",
    })
    .returning();
  await assert.rejects(retryJob(userId, limit.id));
  worker.kill("SIGTERM");
  await once(worker, "exit");
  worker = undefined;
  const persisted = await listJobs(userId);
  assert.equal(
    persisted.jobs.filter((job) => job.status === "completed").length,
    2,
  );
  console.info(
    "Local credentials auth, authenticated library/job routes, durable queue/recovery, ownership, cancellation, idempotent completion, lease fencing and retry limits passed without model inference.",
  );
} finally {
  if (worker) {
    worker.kill("SIGTERM");
    await once(worker, "exit").catch(() => {});
  }
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  await db.delete(user).where(eq(user.email, email));
  await pool.end();
}
