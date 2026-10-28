import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { examplePlan } from "@drishya/motion/examples";
import {
  openBrowser,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";
import { env } from "../src/env";
import { motionBundle } from "../src/explanations/render";

const directory = path.resolve(env.MEDIA_ROOT, "v2", "render-benchmark");
await mkdir(directory, { recursive: true });
const { url } = await motionBundle(),
  browser = await openBrowser("chrome", {
    browserExecutable:
      process.env.BENCHMARK_BROWSER_PATH ??
      env.CHROME_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    logLevel: "error",
  });
const base = examplePlan("process"),
  plan = {
    ...base,
    beats: [
      {
        ...base.beats[0],
        durationInFrames: 150,
        visual: { ...base.beats[0].visual, dimension: "2d" as const },
      },
    ],
  },
  props = { plan, muted: true };
const results = [];
try {
  const composition = await selectComposition({
    serveUrl: url,
    id: "Explanation",
    inputProps: props,
    puppeteerInstance: browser,
  });
  for (const concurrency of [1, 2]) {
    const started = Date.now();
    await renderMedia({
      serveUrl: url,
      composition,
      inputProps: props,
      outputLocation: path.join(
        directory,
        `${process.env.BENCHMARK_BROWSER_PATH ? "managed-" : ""}${concurrency}.mp4`,
      ),
      codec: "h264",
      pixelFormat: "yuv420p",
      crf: 20,
      x264Preset: "veryfast",
      muted: true,
      scale: 1,
      concurrency,
      puppeteerInstance: browser,
      logLevel: "error",
    });
    results.push({ concurrency, elapsedMs: Date.now() - started, frames: 150 });
    console.info(results.at(-1));
  }
  await writeFile(
    path.join(
      directory,
      process.env.BENCHMARK_BROWSER_PATH
        ? "report-managed.json"
        : "report.json",
    ),
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close({ silent: true });
}
