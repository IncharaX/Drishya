import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { motionPlanSchema } from "@drishya/contracts";
import { examplePlan } from "@drishya/motion/examples";
import {
  openBrowser,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { semanticAsset } from "../../../packages/motion/src/semantics";
import { env } from "../src/env";
import { motionBundle } from "../src/explanations/render";

for (const [label, wrong, expected] of [
  ["Plant", "idea", "plant"],
  ["Roots", "idea", "roots"],
  ["Soil", "atom", "soil"],
  ["Sun", "planet", "sun"],
  ["Air", "check", "air"],
  ["Unrecognised concept", "idea", "label"],
] as const)
  assert.equal(
    semanticAsset({
      id: "subject",
      label,
      icon: wrong,
      detail: "",
      shape: "sphere",
    }),
    expected,
  );
const directory = path.resolve(env.MEDIA_ROOT, "v2", "semantic-review");
await mkdir(directory, { recursive: true });
const { url } = await motionBundle(),
  browser = await openBrowser("chrome", {
    browserExecutable:
      env.CHROME_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    logLevel: "error",
  });
try {
  for (const kind of ["objects", "merge"]) {
    const base = examplePlan("process");
    const plan = motionPlanSchema.parse({
      ...base,
      title: "Semantic scene regression",
      theme: {
        ...base.theme,
        background: "#f5f3ee",
        ink: "#18243a",
        accent: "#47805a",
      },
      beats: [
        {
          id: "mechanism",
          title:
            kind === "objects"
              ? "Water enters through the roots"
              : "Inputs combine into one result",
          narration: "This is an authored visual regression fixture.",
          durationInFrames: 240,
          visual: {
            kind: kind === "objects" ? "process" : "cause",
            dimension: kind === "objects" ? "3d" : "2d",
            nodes:
              kind === "objects"
                ? [
                    {
                      id: "soil",
                      label: "Soil",
                      detail: "Water in the ground",
                      icon: "atom",
                    },
                    {
                      id: "roots",
                      label: "Roots",
                      detail: "Water enters the plant",
                      icon: "idea",
                    },
                    {
                      id: "plant",
                      label: "Plant",
                      detail: "Leaves and stem",
                      icon: "idea",
                    },
                  ]
                : [
                    {
                      id: "sunlight",
                      label: "Sunlight",
                      detail: "Energy",
                      icon: "planet",
                    },
                    {
                      id: "water",
                      label: "Water",
                      detail: "From the roots",
                      icon: "atom",
                    },
                    {
                      id: "air",
                      label: "Carbon dioxide",
                      detail: "From the air",
                      icon: "check",
                    },
                    {
                      id: "food",
                      label: "Sugar",
                      detail: "Made in the leaf",
                      icon: "idea",
                    },
                  ],
            links:
              kind === "objects"
                ? [
                    { from: "soil", to: "roots", label: "Water" },
                    { from: "roots", to: "plant", label: "Moves upward" },
                  ]
                : ["sunlight", "water", "air"].map((from) => ({
                    from,
                    to: "food",
                    label: from,
                  })),
          },
        },
      ],
    });
    const props = { plan, muted: true },
      composition = await selectComposition({
        serveUrl: url,
        id: "Explanation",
        inputProps: props,
        puppeteerInstance: browser,
      });
    await renderStill({
      serveUrl: url,
      composition,
      inputProps: props,
      output: path.join(directory, `${kind}.png`),
      frame: 90,
      scale: 1,
      puppeteerInstance: browser,
      logLevel: "error",
    });
  }
} finally {
  await browser.close({ silent: true });
}
console.info("Semantic identity and fresh layout fixtures passed", directory);
