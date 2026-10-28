import { explanationRevision, generationJob } from "@drishya/db/schema";
import { desc, eq } from "drizzle-orm";
import { db, pool } from "../src/database";

try {
  const rows = await db
    .select({ revision: explanationRevision, job: generationJob })
    .from(explanationRevision)
    .innerJoin(
      generationJob,
      eq(generationJob.resourceId, explanationRevision.id),
    )
    .orderBy(desc(explanationRevision.createdAt))
    .limit(18);
  console.info(
    JSON.stringify(
      rows.map(({ revision: r, job: j }) => ({
        id: r.id,
        duration: r.duration,
        timings: r.timings,
        jobCreated: j.createdAt,
        eligible: j.runAfter,
        completed: j.updatedAt,
        attempts: j.attempts,
        status: j.status,
        beatCount: r.plan?.beats.length,
        fittingRewrites: r.edit.fitAttempts ?? 0,
        wallMs: j.updatedAt.getTime() - j.createdAt.getTime(),
        unattributedMs:
          j.updatedAt.getTime() -
          j.createdAt.getTime() -
          (r.timings.totalMs ?? 0),
      })),
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
