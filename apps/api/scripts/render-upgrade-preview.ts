import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { applyDirectorEdit, interpretDirectEdit } from "@drishya/ai";
import { fitExactTimeline, planFrames } from "@drishya/contracts";
import { examplePlan } from "@drishya/motion/examples";
import {
  renderExplanation,
  revisionDirectory,
} from "../src/explanations/render";

const edit = interpretDirectEdit(
  "Use the Manrope font, cream background and 3D components with a calm soundtrack",
);
assert.ok(edit);
let plan = applyDirectorEdit(examplePlan("process"), edit);
plan = fitExactTimeline(plan, 40);
assert.equal(planFrames(plan), 1200);
const id = "upgrade-process-40s";
const result = await renderExplanation({
  requireNarration: false,
  id,
  plan,
  signal: AbortSignal.timeout(600000),
  onProgress: async (stage, progress) => console.info(progress, stage),
});
assert.equal(result.duration, 40);
await writeFile(
  path.join(revisionDirectory(id), "plan.json"),
  JSON.stringify(plan, null, 2),
);
console.info(
  `40-second 3D/font/sound/timeline render passed: ${revisionDirectory(id)}`,
);
