import { explanationRevision, generationJob } from "@drishya/db/schema";
import { desc, inArray } from "drizzle-orm";
import { db, pool } from "../src/database";

try {
  const rows = await db
    .select()
    .from(explanationRevision)
    .orderBy(desc(explanationRevision.createdAt))
    .limit(14);
  console.info(
    JSON.stringify(
      rows.map((row) => ({
        id: row.id,
        chat: row.conversationId,
        parent: row.collectionId,
        part: row.partIndex,
        title: row.title,
        status: row.status,
        stage: row.stage,
        progress: row.progress,
        error: row.errorMessage,
        outline: row.outline,
      })),
      null,
      2,
    ),
  );
  const jobs = await db
    .select({
      resource: generationJob.resourceId,
      status: generationJob.status,
      stage: generationJob.stage,
      error: generationJob.errorMessage,
      attempts: generationJob.attempts,
    })
    .from(generationJob)
    .where(
      inArray(generationJob.status, [
        "failed",
        "running",
        "retrying",
        "queued",
      ]),
    )
    .orderBy(desc(generationJob.createdAt))
    .limit(10);
  console.info(JSON.stringify(jobs, null, 2));
} finally {
  await pool.end();
}
