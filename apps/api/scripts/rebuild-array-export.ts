import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { motionPlanSchema, visualIssues } from "@drishya/contracts";
import { explanationRevision } from "@drishya/db/schema";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/database";
import { validateAudio } from "../src/explanations/audio";
import {
  renderExplanation,
  revisionDirectory,
} from "../src/explanations/render";

const id = "77d8a9c0-0dc2-4d2e-a0d8-ff901decc88a";
try {
  const [row] = await db
    .select()
    .from(explanationRevision)
    .where(eq(explanationRevision.id, id));
  if (!row?.plan || row.status !== "ready")
    throw new Error("Expected saved array video");
  const plan = motionPlanSchema.parse(row.plan),
    directory = revisionDirectory(id),
    backup = path.join(directory, `visual-backup-${Date.now()}`);
  await mkdir(backup, { recursive: true });
  for (const name of ["video.mp4", "poster.jpg", "manifest.json"])
    await copyFile(path.join(directory, name), path.join(backup, name)).catch(
      () => {},
    );
  await writeFile(
    path.join(backup, "plan.json"),
    JSON.stringify(plan, null, 2),
  );
  plan.theme = {
    ...plan.theme,
    background: "#f5f3ee",
    ink: "#18243a",
    accent: "#6754df",
  };
  const operations = ["build", "types", "operations"] as const;
  for (const [i, beat] of plan.beats.entries()) {
    beat.visual = {
      ...beat.visual,
      kind: "array",
      links: [],
      array: {
        operation: operations[i] ?? "iterate",
        name: "numbers",
        items: ["1", "2", "3"],
        index: 1,
        replacement: "9",
      },
    };
  }
  if (visualIssues(plan).length) throw new Error(visualIssues(plan).join(" "));
  const result = await renderExplanation({
    id,
    plan,
    signal: AbortSignal.timeout(600000),
    onProgress: async (stage, progress) => console.info(progress, stage),
  });
  await validateAudio(path.join(directory, "video.mp4"), result.duration, true);
  await db
    .update(explanationRevision)
    .set({ plan, segmentKeys: result.segmentKeys, updatedAt: new Date() })
    .where(eq(explanationRevision.id, id));
  console.info("Rebuilt actual array video", id, result);
} finally {
  await pool.end();
}
