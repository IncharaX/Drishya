import {
  conversation,
  explanationRevision,
  generationJob,
} from "@drishya/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/database";
import { retryRevision } from "../src/explanations/service";

try {
  const id = "9e55f388-91c6-4352-8b3d-621b5c579f3c";
  const [row] = await db
    .select()
    .from(explanationRevision)
    .where(eq(explanationRevision.id, id));
  if (!row) throw new Error("Chapter not found");
  const [chat] = await db
    .select()
    .from(conversation)
    .where(eq(conversation.id, row.conversationId));
  const [job] = await db
    .select()
    .from(generationJob)
    .where(eq(generationJob.resourceId, id))
    .orderBy(desc(generationJob.createdAt))
    .limit(1);
  console.info("Chapter", {
    id: row.id,
    title: row.title,
    status: row.status,
    parent: row.collectionId,
    part: row.partIndex,
    error: row.errorMessage,
    job: job && { status: job.status, attempts: job.attempts },
  });
  const active = await db
    .select({ id: generationJob.resourceId, status: generationJob.status })
    .from(generationJob)
    .where(inArray(generationJob.status, ["running", "queued", "retrying"]));
  console.info("Active", active);
  if (row.collectionId) {
    const [parent] = await db
      .select()
      .from(explanationRevision)
      .where(eq(explanationRevision.id, row.collectionId));
    console.info("Outline", parent?.outline);
    for (const [index, part] of (parent?.outline ?? []).entries()) {
      const children = await db
        .select()
        .from(explanationRevision)
        .where(
          and(
            eq(explanationRevision.collectionId, row.collectionId),
            eq(explanationRevision.partIndex, index),
          ),
        );
      for (const child of children)
        await db
          .update(explanationRevision)
          .set({
            title: part.title,
            plan: child.plan ? { ...child.plan, title: part.title } : null,
          })
          .where(eq(explanationRevision.id, child.id));
    }
  }
  if (job?.status === "failed" && job.attempts < job.maxAttempts && chat) {
    await retryRevision(chat.userId, chat.id, id);
    console.info("Retried saved chapter; attempt budget preserved");
  }
} finally {
  await pool.end();
}
