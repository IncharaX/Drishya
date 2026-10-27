import { generationJobSchema, type JobKind } from "@drishya/contracts";
import { generationJob, workerHeartbeat } from "@drishya/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../database";
import { HttpError } from "../http-error";
import { resourceFailure, resourcePending } from "./resources";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function enqueue(
  tx: Tx,
  input: {
    userId: string;
    projectId: string;
    chapterId?: string;
    kind: JobKind;
    resourceId: string;
    payload?: { fitting?: { target: number; duration: number } };
  },
) {
  const active = await tx
    .select({ id: generationJob.id })
    .from(generationJob)
    .where(
      and(
        eq(generationJob.kind, input.kind),
        eq(generationJob.resourceId, input.resourceId),
        inArray(generationJob.status, ["queued", "running", "retrying"]),
      ),
    );
  if (active.length)
    throw new HttpError(409, "This generation is already queued or running.");
  await tx.insert(generationJob).values(input);
}
export function serializeJob(record: typeof generationJob.$inferSelect) {
  return generationJobSchema.parse({
    ...record,
    cancelRequested: !!record.cancelRequestedAt,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}
export async function listJobs(userId: string, projectId?: string) {
  const jobs = await db
    .select()
    .from(generationJob)
    .where(
      and(
        eq(generationJob.userId, userId),
        projectId ? eq(generationJob.projectId, projectId) : undefined,
      ),
    )
    .orderBy(desc(generationJob.createdAt))
    .limit(50);
  const [live] = await db
    .select({ id: workerHeartbeat.id })
    .from(workerHeartbeat)
    .where(sql`${workerHeartbeat.seenAt}>now()-interval '30 seconds'`)
    .limit(1);
  return { jobs: jobs.map(serializeJob), workerOnline: !!live };
}

export async function cancelJob(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(generationJob)
      .where(and(eq(generationJob.id, id), eq(generationJob.userId, userId)))
      .for("update");
    if (!record || !["queued", "running", "retrying"].includes(record.status))
      throw new HttpError(
        409,
        "This job has already finished or does not exist.",
      );
    const [saved] = await tx
      .update(generationJob)
      .set({
        cancelRequestedAt: new Date(),
        updatedAt: new Date(),
        ...(record.status !== "running"
          ? { status: "cancelled" as const, stage: "Cancelled" }
          : {}),
      })
      .where(eq(generationJob.id, id))
      .returning();
    if (record.status !== "running")
      await resourceFailure(
        tx,
        record,
        "Generation cancelled. Saved outputs are preserved.",
        true,
      );
    return serializeJob(saved);
  });
}
export async function retryJob(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(generationJob)
      .where(and(eq(generationJob.id, id), eq(generationJob.userId, userId)))
      .for("update");
    if (
      !record ||
      !["failed", "cancelled"].includes(record.status) ||
      record.attempts >= record.maxAttempts
    )
      throw new HttpError(
        409,
        "This job cannot be retried. Start a new generation from the saved lesson.",
      );
    const [active] = await tx
      .select({ id: generationJob.id })
      .from(generationJob)
      .where(
        and(
          eq(generationJob.kind, record.kind),
          eq(generationJob.resourceId, record.resourceId),
          inArray(generationJob.status, ["queued", "running", "retrying"]),
        ),
      )
      .limit(1);
    const [latest] = await tx
      .select({ id: generationJob.id })
      .from(generationJob)
      .where(
        and(
          eq(generationJob.kind, record.kind),
          eq(generationJob.resourceId, record.resourceId),
        ),
      )
      .orderBy(desc(generationJob.createdAt))
      .limit(1);
    if (latest?.id !== record.id)
      throw new HttpError(
        409,
        "A newer generation already exists for this resource.",
      );
    if (active)
      throw new HttpError(409, "This resource already has an active job.");
    await resourcePending(tx, record);
    const [saved] = await tx
      .update(generationJob)
      .set({
        status: "queued",
        stage: "Waiting for worker",
        cancelRequestedAt: null,
        errorMessage: null,
        runAfter: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(generationJob.id, id))
      .returning();
    return serializeJob(saved);
  });
}
