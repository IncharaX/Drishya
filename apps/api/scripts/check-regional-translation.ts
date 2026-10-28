import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ExplanationDirector } from "@drishya/ai";
import { examplePlan } from "@drishya/motion/examples";
import { creationSettingsSchema, type MotionPlan } from "@drishya/contracts";
const config = { baseURL: "http://127.0.0.1:11434", model: "regression-fixture", timeoutMs: 1000 };
class CanonicalCheck extends ExplanationDirector {
  calls = 0;
  protected async generate() { this.calls++; return JSON.stringify(examplePlan("solar")); }
  async translate(plan: MotionPlan, language: "en" | "hi" | "kn" | "te") {
    assert.equal(plan.language, "en"); return { ...plan, language };
  }
}
for (const language of ["kn", "te"] as const) {
  const director = new CanonicalCheck(config);
  const plan = await director.create("Explain the solar system", creationSettingsSchema.parse({ language, duration: 30 }), AbortSignal.timeout(5000));
  assert.equal(plan.language, language); assert.equal(director.calls, 1);
}
class FieldCheck extends ExplanationDirector {
  calls = 0;
  protected async generate(messages: { role: string; content: string }[]) {
    this.calls++; assert.match(messages.at(-1)!.content, /8/);
    return JSON.stringify({ text: this.calls === 1 ? "6 ಗ್ರಹಗಳು" : "8 ಗ್ರಹಗಳು" });
  }
}
const previous = process.env.MEDIA_ROOT;
process.env.MEDIA_ROOT = await mkdtemp(path.join(os.tmpdir(), "drishya-regional-"));
try {
  const plan = examplePlan("solar"); plan.title = plan.summary = "Eight planets";
  for (const beat of plan.beats) {
    beat.title = beat.narration = "Eight planets";
    for (const node of beat.visual.nodes) node.label = node.detail = "Eight planets";
    for (const link of beat.visual.links) link.label = "Eight planets";
  }
  const director = new FieldCheck(config);
  const result = await director.translate(plan, "kn", AbortSignal.timeout(10000));
  assert.equal(result.beats[0].narration, "8 ಗ್ರಹಗಳು"); assert.equal(director.calls, 2);
  assert.deepEqual(result.beats.map(b => b.visual.nodes.map(n => n.id)), plan.beats.map(b => b.visual.nodes.map(n => n.id)));
  await director.translate(plan, "kn", AbortSignal.timeout(10000)); assert.equal(director.calls, 2);
  console.info("PASS: canonical English kn/te plans, number protection, cache reuse and preserved node IDs. Fixture test; no model calls.");
} finally {
  if (previous === undefined) delete process.env.MEDIA_ROOT; else process.env.MEDIA_ROOT = previous;
}
