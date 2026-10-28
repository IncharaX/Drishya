import assert from "node:assert/strict";
import {
  ExplanationDirector,
  sourceGroundingIssues,
  type SourceDocument,
} from "@drishya/ai";
import {
  creationSettingsSchema,
  motionPlanSchema,
  visualIssues,
} from "@drishya/contracts";
import { examplePlan } from "@drishya/motion/examples";
const quote =
  "Build an offline system that turns a typed concept into a short narrated animated lesson.";
const sources: SourceDocument[] = [
  {
    id: "source-1",
    name: "Challenge.pdf",
    text: quote + " The output must play in a browser and export as an MP4.",
  },
];
const plan = motionPlanSchema.parse(examplePlan("process"));
for (const beat of plan.beats) {
  beat.title = "A concept becomes an animated lesson";
  beat.narration = sources[0].text;
  beat.evidence = [{ sourceId: "source-1", quote }];
  beat.visual.nodes = motionPlanSchema.parse({
    ...plan,
    beats: [
      {
        ...beat,
        visual: {
          ...beat.visual,
          nodes: [
            {
              id: "input",
              label: "Concept input",
              detail: "How does a Python loop work?",
              icon: "document",
            },
            {
              id: "plan",
              label: "Local lesson plan",
              detail: '{"scenes": ["code", "iteration"]}',
              icon: "server",
            },
            {
              id: "video",
              label: "Narrated video",
              detail: "Animated explanation · Captions · MP4",
              icon: "document",
            },
          ],
        },
      },
    ],
  }).beats[0].visual.nodes;
  beat.visual.links = [];
  beat.visual.actions = [
    {
      operation: "type",
      subjectId: beat.visual.nodes[0].id,
      targetId: beat.visual.nodes[0].id,
      cue: "Build an offline system",
    },
    {
      operation: "transfer",
      subjectId: beat.visual.nodes[0].id,
      targetId: beat.visual.nodes[1].id,
      cue: "typed concept",
    },
    {
      operation: "transform",
      subjectId: "plan",
      targetId: "video",
      cue: "The output",
    },
  ];
}
class Fixture extends ExplanationDirector {
  calls = 0;
  constructor() {
    super({ baseURL: "http://unused.invalid", model: "fixture", timeoutMs: 1 });
  }
  protected override async generate(
    messages: { role: string; content: string }[],
  ) {
    const input = JSON.parse(
      messages.find((message) => message.role === "user")!.content,
    );
    if (this.calls === 0) assert.deepEqual(input.sourceDocuments, sources);
    else
      assert.ok(
        input.sourcePassages.some((passage: { quote: string }) =>
          passage.quote.includes(quote),
        ),
        "The writer receives actual source passages independently",
      );
    this.calls++;
    return JSON.stringify(
      this.calls === 1
        ? {
            title: "Offline video engine",
            estimatedDuration: 60,
            chapters: [],
            clarification: null,
          }
        : {
            ...plan,
            beats: plan.beats.map((beat) => ({
              ...beat,
              visual: { ...beat.visual, actions: undefined },
              evidence: [{ passageId: input.sourcePassages[0].passageId }],
            })),
          },
    );
  }
}
const director = new Fixture(),
  settings = creationSettingsSchema.parse({ duration: "auto" });
await director.assess(
  "Explain this problem statement",
  settings,
  new AbortController().signal,
  sources,
);
// Writing receives the stable source array even after metadata is reloaded.
const result = await director.create(
  "Explain this problem statement",
  settings,
  new AbortController().signal,
  false,
  sources,
);
assert.equal(director.calls, 2);
assert.deepEqual(sourceGroundingIssues(result, sources), []);
assert.ok(
  result.beats[0].visual.actions?.every((action) => action.at !== undefined),
);
const generic = structuredClone(result);
generic.beats[0].narration =
  "A hackathon problem statement is a challenge card. Climate change is a useful example.";
assert.ok(
  sourceGroundingIssues(generic, sources).length,
  "Generic content must not pass with an unrelated real quote",
);
generic.beats[0].evidence = [
  {
    sourceId: "source-1",
    quote: "This invented quote never appeared in the uploaded document.",
  },
];
assert.ok(sourceGroundingIssues(generic, sources).length);
const broken = structuredClone(result);
broken.beats[0].visual.actions![0].subjectId = "missing";
assert.ok(visualIssues(broken).some((issue) => issue.includes("artifact IDs")));
console.info(
  "Passed: automatic-duration source handoff, verbatim evidence, rejection of generic scripts, action timing and artifact validation.",
);
if (process.env.RENDER_ACTIONS === "1") {
  const { mkdir } = await import("node:fs/promises"),
    path = await import("node:path");
  const { openBrowser, selectComposition, renderStill } = await import(
    "@remotion/renderer"
  );
  const { motionBundle } = await import("../src/explanations/render");
  const directory = path.resolve("../../data/v2/action-review");
  await mkdir(directory, { recursive: true });
  const { url } = await motionBundle();
  const browser = await openBrowser("chrome", {
    browserExecutable:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    logLevel: "error",
  });
  try {
    const preview = motionPlanSchema.parse({
      ...result,
      title: "Offline video engine",
      beats: [{ ...result.beats[0], durationInFrames: 300, audioDuration: 10 }],
    });
    const inputProps = { plan: preview, muted: true };
    const composition = await selectComposition({
      serveUrl: url,
      id: "Explanation",
      inputProps,
      puppeteerInstance: browser,
    });
    for (const frame of [35, 130, 245])
      await renderStill({
        serveUrl: url,
        composition,
        inputProps,
        output: path.join(directory, `${frame}.png`),
        frame,
        puppeteerInstance: browser,
        logLevel: "error",
      });
    console.info("Action stills rendered", directory);
  } finally {
    await browser.close({ silent: true });
  }
}
