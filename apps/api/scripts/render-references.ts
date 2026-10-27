import { examplePlan } from "@drishya/motion/examples";
import {
  renderExplanation,
  revisionDirectory,
} from "../src/explanations/render";

for (const kind of ["solar", "process", "cause"] as const) {
  const id = `reference-${kind}`;
  const result = await renderExplanation({
    requireNarration: false,
    id,
    plan: examplePlan(kind),
    signal: AbortSignal.timeout(600_000),
    scale: 1,
    onProgress: async (stage, progress) => {
      console.info(kind, progress, stage);
    },
  });
  console.info(kind, result, revisionDirectory(id));
}
