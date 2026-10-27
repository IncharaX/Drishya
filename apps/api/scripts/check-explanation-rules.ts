import assert from "node:assert/strict";
import {
  applyDirectorEdit,
  ExplanationDirector,
  interpretDirectEdit,
} from "@drishya/ai";
import {
  creationSettingsSchema,
  fitExactTimeline,
  motionPlanSchema,
  planFrames,
  validChapterTotal,
} from "@drishya/contracts";
import { examplePlan } from "@drishya/motion/examples";
import { captionText } from "../src/explanations/render";

class FixtureDirector extends ExplanationDirector {
  constructor(private response: unknown) {
    super({ baseURL: "http://unused.invalid", model: "fixture", timeoutMs: 1 });
  }
  protected override async generate() {
    return JSON.stringify(this.response);
  }
}
const signal = new AbortController().signal;
const chapter = (title: string) => ({
  title,
  objective: "Explain this distinct section clearly.",
  estimatedDuration: 60,
});
const assessment = (estimatedDuration: number) => ({
  title: "Python",
  estimatedDuration,
  chapters: [chapter("Basics"), chapter("Control flow")],
  clarification: null,
});
for (const seconds of [30, 90, 120]) {
  const result = await new FixtureDirector(assessment(seconds)).assess(
    "Explain Python",
    creationSettingsSchema.parse({ coverage: "complete" }),
    signal,
  );
  assert.equal(
    result.chapters.length,
    0,
    "Videos at or below 120 seconds must not split",
  );
}
assert.equal(
  (
    await new FixtureDirector(assessment(150)).assess(
      "Explain Python",
      creationSettingsSchema.parse({ coverage: "overview" }),
      signal,
    )
  ).chapters.length,
  0,
);
assert.equal(
  (
    await new FixtureDirector(assessment(150)).assess(
      "Explain Python completely",
      creationSettingsSchema.parse({ coverage: "complete" }),
      signal,
    )
  ).chapters.length,
  2,
);
const plan = examplePlan("process");
const before = structuredClone(plan);
const edit = await new FixtureDirector(null).revise(
  plan,
  "Change the background to blue; keep the narration",
  [],
  signal,
);
assert.equal(edit.kind, "style");
assert.equal(edit.background, "#163c83");
assert.deepEqual(edit.replacementNarrations, []);
assert.deepEqual(
  plan,
  before,
  "Edit interpretation must not mutate a saved version",
);
const oneBeat = motionPlanSchema.parse({ ...plan, beats: [plan.beats[0]] });
assert.ok(
  planFrames(oneBeat) > 0,
  "Measured chapter groups may contain one semantic beat",
);
const captions = captionText(oneBeat, "vtt");
assert.ok(captions.startsWith("WEBVTT\n\n"));
assert.ok(captions.includes("00:00:00.200 -->"));
console.info(
  "Explanation rules passed: 120-second boundary, overview scoping, style-only edits, single-beat chapters and caption timeline.",
);

const extended = await new FixtureDirector(assessment(180)).assess(
  "A complete process",
  creationSettingsSchema.parse({ duration: 180, coverage: "complete" }),
  signal,
);
assert.equal(
  extended.chapters.reduce((sum, part) => sum + part.estimatedDuration, 0),
  180,
);
assert.equal(validChapterTotal([chapter("a"), chapter("b")]), false);
assert.equal(validChapterTotal(extended.chapters), true);
const short = await new FixtureDirector(assessment(180)).assess(
  "A short process",
  creationSettingsSchema.parse({ duration: 40, coverage: "complete" }),
  signal,
);
assert.equal(short.chapters.length, 0);
const combined = interpretDirectEdit(
  "Change the background to blue, switch the font to serif and add 3D components",
);
assert.ok(combined);
const updated = applyDirectorEdit(plan, combined);
assert.equal(updated.theme.font, "serif");
assert.equal(updated.theme.background, "#163c83");
assert.ok(updated.beats.every((beat) => beat.visual.dimension === "3d"));
assert.deepEqual(
  updated.beats.map((beat) => beat.narration),
  plan.beats.map((beat) => beat.narration),
);
assert.deepEqual(
  updated.beats.map((beat) => beat.visual.links),
  plan.beats.map((beat) => beat.visual.links),
);
const timeline = motionPlanSchema.parse({
  ...plan,
  beats: plan.beats.map((beat) => ({ ...beat, audioDuration: 5 })),
});
const exact = fitExactTimeline(timeline, 40);
assert.equal(planFrames(exact), 1200);
assert.equal(planFrames(fitExactTimeline(timeline, 120)), 3600);
assert.throws(() => fitExactTimeline(timeline, 10));
assert.equal(
  interpretDirectEdit("Change the font to Poppins")?.kind,
  "question",
);
console.info(
  "Upgrade checks passed: exact 40/120 second timelines, >120 chapter totals, combined font/3D/color edits, supported-font clarification and preserved narration/topology.",
);

const localEdit = interpretDirectEdit(
  "Use the serif font, red background and 3D components",
  [plan.beats[0].id],
);
assert.ok(localEdit);
const local = applyDirectorEdit(plan, localEdit);
assert.equal(local.theme.font, plan.theme.font);
assert.equal(local.beats[0].theme?.font, "serif");
assert.equal(local.beats[0].visual.dimension, "3d");
assert.equal(local.beats[1].visual.dimension, plan.beats[1].visual.dimension);
