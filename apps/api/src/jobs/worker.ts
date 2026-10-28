import { randomUUID } from "node:crypto";
import { PlannerError } from "@drishya/ai";
import { generationJob, workerHeartbeat } from "@drishya/db/schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, pool } from "../database";
import { executeExplanation } from "../explanations/pipeline";
import { HttpError } from "../http-error";
import { executePlanning } from "../planning/service";
import { executeVoiceover } from "../speech/service";
import { executeStoryboard } from "../storyboards/service";
import { executeVideo } from "../video/service";
import { jobContext } from "./context";
import { metric } from "./metrics";
import { resourceFailure, resourcePending } from "./resources";

import { executeLearning } from "../explanations/learning";
const workerId = randomUUID();
const workerBootAt = Date.now();
const liveMetrics = setInterval(() => {
  void metric(
    "worker_live",
    { workerId, bootAt: workerBootAt },
    "_workers",
  ).catch(() => {});
}, 15000);
await metric("worker_boot", { workerId, bootAt: workerBootAt }, "_workers");
let stopping = false,
  active: AbortController | null = null;
const stop = () => {
  stopping = true;
  active?.abort(new Error("Worker shutdown"));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const leaseSQL = sql`now()+interval '90 seconds'`;
async function claim() {
  const claimStarted = Date.now();
  return db.transaction(async (tx) => {
    // Transaction-level advisory locks work through Neon's transaction pooler.
    const gate = await tx.execute(
      sql`select pg_try_advisory_xact_lock(72415,5) as acquired`,
    );
    if (!gate.rows[0]?.acquired) return null;
    await tx
      .insert(workerHeartbeat)
      .values({ id: workerId, seenAt: new Date() })
      .onConflictDoUpdate({
        target: workerHeartbeat.id,
        set: { seenAt: new Date() },
      });
    const expired = await tx
      .select()
      .from(generationJob)
      .where(
        and(
          eq(generationJob.status, "running"),
          sql`${generationJob.leaseUntil}<now()`,
        ),
      )
      .for("update");
    for (const job of expired) {
      await metric(
        "lease_recovery",
        { attempt: job.attempts, leaseExpiredAt: job.leaseUntil?.getTime() },
        job.id,
      );
      const cancelled = !!job.cancelRequestedAt,
        exhausted = job.attempts >= job.maxAttempts;
      const message = cancelled
        ? "Generation cancelled. Saved outputs are preserved."
        : exhausted
          ? "Worker recovery limit reached. Start a new generation from the saved inputs."
          : "Worker stopped. Resuming from saved outputs.";
      await tx
        .update(generationJob)
        .set({
          status: cancelled ? "cancelled" : exhausted ? "failed" : "retrying",
          lockToken: null,
          leaseUntil: null,
          stage: message,
          errorMessage: message,
          runAfter: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(generationJob.id, job.id));
      if (cancelled || exhausted)
        await resourceFailure(tx, job, message, cancelled);
      else await resourcePending(tx, job);
    }
    const [running] = await tx
      .select({ id: generationJob.id })
      .from(generationJob)
      .where(eq(generationJob.status, "running"))
      .limit(1);
    if (running) return null;
    const [next] = await tx
      .select()
      .from(generationJob)
      .where(
        and(
          inArray(generationJob.status, ["queued", "retrying"]),
          sql`${generationJob.runAfter}<=now()`,
        ),
      )
      .orderBy(
        sql`coalesce((select max(served.updated_at) from drishya.generation_job served where served.project_id=${generationJob.projectId} and served.status='completed' and served.created_at>=${generationJob.createdAt}), timestamp '1970-01-01')`,
        asc(generationJob.runAfter),
        asc(generationJob.createdAt),
      )
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return null;
    if (next.cancelRequestedAt) {
      await tx
        .update(generationJob)
        .set({ status: "cancelled", stage: "Cancelled", updatedAt: new Date() })
        .where(eq(generationJob.id, next.id));
      await resourceFailure(
        tx,
        next,
        "Generation cancelled. Saved outputs are preserved.",
        true,
      );
      return null;
    }
    if (next.attempts >= next.maxAttempts) {
      await tx
        .update(generationJob)
        .set({
          status: "failed",
          stage: "Attempt limit reached",
          updatedAt: new Date(),
        })
        .where(eq(generationJob.id, next.id));
      await resourceFailure(tx, next, "Generation attempt limit reached.");
      return null;
    }
    const [claimed] = await tx
      .update(generationJob)
      .set({
        status: "running",
        lockToken: randomUUID(),
        leaseUntil: leaseSQL,
        attempts: next.attempts + 1,
        stage: "Starting worker",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(generationJob.id, next.id))
      .returning();
    await resourcePending(tx, claimed);
    await metric(
      "claim",
      {
        workerId,
        claimTransactionMs: Date.now() - claimStarted,
        workerUptimeMs: Date.now() - workerBootAt,
      },
      claimed.id,
    );
    return claimed;
  });
}
function retryable(error: unknown) {
  if (error instanceof HttpError) return error.status >= 500;
  if (error instanceof PlannerError)
    return [
      "OLLAMA_UNAVAILABLE",
      "OLLAMA_TIMEOUT",
      "OLLAMA_ERROR",
      "INTERRUPTED",
    ].includes(error.code);
  if (error instanceof Error && error.name === "DrizzleQueryError") return true;
  return (
    error instanceof Error &&
    /connection|timeout|ECONN|ENOTFOUND|socket|network/iu.test(error.message)
  );
}
function failureMessage(error: unknown) {
  if (error instanceof HttpError || error instanceof PlannerError)
    return error.message.slice(0, 1500);
  if (error instanceof Error && error.name === "DrizzleQueryError")
    return "Storage could not save this generation. Saved stages will be reused when retried.";
  return error instanceof Error
    ? `${error.name}: ${error.message.slice(0, 1000)}`
    : "Generation failed unexpectedly.";
}
async function execute(job: typeof generationJob.$inferSelect) {
  const executionStarted = Date.now();
  await metric(
    "attempt_start",
    {
      attempt: job.attempts,
      createdAt: job.createdAt.getTime(),
      eligibleAt: job.runAfter.getTime(),
      waitSinceEligibleMs: Date.now() - job.runAfter.getTime(),
      wallSinceCreatedMs: Date.now() - job.createdAt.getTime(),
    },
    job.id,
  );
  const token = job.lockToken;
  if (!token) throw new Error("Claimed job has no lease token");
  const controller = new AbortController();
  active = controller;
  let heartbeatBusy = false;
  const owned = () =>
    and(
      eq(generationJob.id, job.id),
      eq(generationJob.lockToken, token),
      eq(generationJob.status, "running"),
      sql`${generationJob.leaseUntil}>now()`,
      isNull(generationJob.cancelRequestedAt),
    );
  const heartbeat = setInterval(() => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    void (async () => {
      const [live] = await db
        .update(generationJob)
        .set({ leaseUntil: leaseSQL, updatedAt: new Date() })
        .where(owned())
        .returning({ id: generationJob.id });
      if (!live)
        controller.abort(
          new Error("Cancellation requested or worker lease lost"),
        );
      await db
        .update(workerHeartbeat)
        .set({ seenAt: new Date() })
        .where(eq(workerHeartbeat.id, workerId));
    })()
      .catch(() => controller.abort(new Error("Database heartbeat lost")))
      .finally(() => {
        heartbeatBusy = false;
      });
  }, 5000);
  const report = async (stage: string, progress: number) => {
    await metric("stage", { stage, progress }, job.id);
    controller.signal.throwIfAborted();
    const [live] = await db
      .update(generationJob)
      .set({
        stage,
        progress: Math.min(99, Math.max(0, progress)),
        updatedAt: new Date(),
      })
      .where(owned())
      .returning({ id: generationJob.id });
    if (!live) {
      controller.abort();
      throw new Error("Worker lease lost or cancellation requested");
    }
  };
  try {
    await jobContext.run(
      {
        id: job.id,
        token: token,
        signal: controller.signal,
        report,
        saveFitting: async (fitting) => {
          controller.signal.throwIfAborted();
          const [live] = await db
            .update(generationJob)
            .set({ payload: { fitting }, updatedAt: new Date() })
            .where(owned())
            .returning({ id: generationJob.id });
          if (!live)
            throw new Error("Worker lease lost while saving fitting state");
        },
      },
      async () => {
        switch (job.kind) {
          case "learning":
            await executeLearning(job.resourceId, controller.signal);
            break;
          case "explanation":
            await executeExplanation(job.resourceId, controller.signal);
            break;
          case "plan":
            await executePlanning(job.resourceId, controller.signal);
            break;
          case "storyboard":
            await executeStoryboard(job.resourceId, controller.signal);
            break;
          case "voiceover":
            await executeVoiceover(
              job.resourceId,
              controller.signal,
              job.payload.fitting,
            );
            break;
          case "video":
            await executeVideo(job.resourceId, controller.signal);
            break;
        }
      },
    );
    const finished = await db
      .update(generationJob)
      .set({
        status: "completed",
        stage: "Completed",
        progress: 100,
        lockToken: null,
        leaseUntil: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(owned())
      .returning({ id: generationJob.id });
    if (!finished.length)
      throw new Error(
        "Lease lost or cancellation requested before job completion",
      );
  } catch (error) {
    console.error(
      `Generation ${job.id} (${job.kind}) stopped:`,
      failureMessage(error),
    );
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(generationJob)
        .where(
          and(
            eq(generationJob.id, job.id),
            eq(generationJob.lockToken, token),
            eq(generationJob.status, "running"),
          ),
        )
        .for("update");
      if (!current) return;
      const cancelled = !!current.cancelRequestedAt;
      const retry =
        !cancelled &&
        current.attempts < current.maxAttempts &&
        (stopping || controller.signal.aborted || retryable(error));
      await metric(
        "attempt_failure",
        {
          attempt: current.attempts,
          cancelled,
          retry,
          reason: failureMessage(error),
        },
        job.id,
      );
      const message = cancelled
        ? "Generation cancelled. Saved outputs are preserved."
        : stopping
          ? "Worker restarting. Saved outputs will be reused."
          : failureMessage(error);
      await tx
        .update(generationJob)
        .set({
          status: cancelled ? "cancelled" : retry ? "retrying" : "failed",
          stage: cancelled ? "Cancelled" : retry ? "Retry scheduled" : "Failed",
          errorMessage: message,
          lockToken: null,
          leaseUntil: null,
          runAfter: new Date(
            Date.now() +
              (stopping ? 0 : Math.min(30_000, 2000 * 2 ** current.attempts)),
          ),
          updatedAt: new Date(),
        })
        .where(eq(generationJob.id, current.id));
      if (retry) await resourcePending(tx, current);
      else await resourceFailure(tx, current, message, cancelled);
    });
  } finally {
    await metric(
      "attempt_end",
      { attempt: job.attempts, executionMs: Date.now() - executionStarted },
      job.id,
    );
    clearInterval(heartbeat);
    active = null;
  }
}
console.info(
  `Drishya generation worker ${workerId} starting; concurrency 1, attempts at most 3.`,
);
try {
  while (!stopping) {
    try {
      const job = await claim();
      if (job) {
        await execute(job);
      } else await sleep(1500);
    } catch (error) {
      console.error(
        "Worker storage unavailable; retrying without discarding jobs.",
        error instanceof Error ? error.name : "Unknown",
      );
      await sleep(3000);
    }
  }
} finally {
  clearInterval(liveMetrics);
  await metric("worker_stop", { workerId }, "_workers");
  await db
    .delete(workerHeartbeat)
    .where(eq(workerHeartbeat.id, workerId))
    .catch(() => {});
  await pool.end();
}
