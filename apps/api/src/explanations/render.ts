import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { type MotionPlan, planFrames } from "@drishya/contracts";
import { bundle } from "@remotion/bundler";
import {
  makeCancelSignal,
  openBrowser,
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { env } from "../env";
import { command } from "../video/render";
import {
  AUDIO_PIPELINE_VERSION,
  buildAudioTrack,
  muxVerifiedAudio,
  validateAudio,
} from "./audio";

export const revisionDirectory = (id: string) =>
  path.resolve(env.MEDIA_ROOT, "v2", "revisions", id);
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
let bundled: Promise<{ url: string; key: string }> | null = null;
export async function motionBundle() {
  if (bundled) return bundled;
  bundled = (async () => {
    const root = [process.cwd(), path.resolve(process.cwd(), "../..")].find(
      (dir) => existsSync(path.join(dir, "packages/motion/src/root.tsx")),
    );
    if (!root)
      throw new Error(
        "Remotion composition sources are missing from the deployment.",
      );
    const directory = path.join(root, "packages/motion/src"),
      sources = [];
    for (const file of (await readdir(directory)).sort())
      if (/\.(ts|tsx)$/u.test(file))
        sources.push(await readFile(path.join(directory, file), "utf8"));
    const key = hash({ sources, version: "remotion-4.0.539-v2" });
    const out = path.resolve(env.MEDIA_ROOT, "v2", "bundles", key);
    await mkdir(path.dirname(out), { recursive: true });
    if (!existsSync(path.join(out, "index.html")))
      await bundle({
        entryPoint: path.join(directory, "root.tsx"),
        outDir: out,
        enableCaching: true,
        publicDir: null,
      });
    return { url: out, key };
  })().catch((error) => {
    bundled = null;
    throw error;
  });
  return bundled;
}
export function captionText(plan: MotionPlan, format: "vtt" | "srt") {
  const stamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${format === "vtt" ? "." : ","}${String(ms % 1000).padStart(3, "0")}`;
  };
  let cursor = 0,
    index = 0;
  const cues: string[] = [];
  for (const beat of plan.beats) {
    const chunks: string[] = [];
    let current = "";
    for (const word of beat.narration.split(/\s+/u)) {
      if ((current + word).length > 70 && current) {
        chunks.push(current.trim());
        current = "";
      }
      current += `${word} `;
    }
    if (current) chunks.push(current.trim());
    const duration = beat.audioDuration
      ? beat.audioDuration / (beat.audioPlaybackRate ?? 1)
      : (beat.durationInFrames ?? 180) / 30;
    chunks.forEach((text, i) => {
      cues.push(
        `${++index}\n${stamp(cursor + 0.2 + (duration * i) / chunks.length)} --> ${stamp(cursor + 0.2 + (duration * (i + 1)) / chunks.length)}\n${text.replace(/[<>]/gu, "").replace(/-->/gu, "→")}\n`,
      );
    });
    cursor += (beat.durationInFrames ?? Math.ceil((duration + 0.5) * 30)) / 30;
  }
  return (format === "vtt" ? "WEBVTT\n\n" : "") + cues.join("\n");
}
export async function renderExplanation(input: {
  id: string;
  plan: MotionPlan;
  signal: AbortSignal;
  onProgress: (stage: string, progress: number) => Promise<void>;
  scale?: number;
  requireNarration?: boolean;
}) {
  const { id, plan, signal, onProgress } = input;
  const scale = input.scale ?? 1.5,
    output = revisionDirectory(id),
    work = path.join(output, `work-${randomUUID()}`);
  await mkdir(output, { recursive: true });
  const { url, key: bundleKey } = await motionBundle();
  const fingerprint = hash({
    plan,
    bundleKey,
    scale,
    audioPipeline: AUDIO_PIPELINE_VERSION,
  });
  try {
    const saved = JSON.parse(
      await readFile(path.join(output, "manifest.json"), "utf8"),
    );
    await access(path.join(output, "video.mp4"));
    if (saved.fingerprint === fingerprint) {
      await validateAudio(
        path.join(output, "video.mp4"),
        planFrames(plan) / 30,
        input.requireNarration !== false,
        signal,
      );
      return {
        segmentKeys: saved.segmentKeys as Record<string, string>,
        duration: planFrames(plan) / 30,
        cached: true,
      };
    }
  } catch {}
  await mkdir(work, { recursive: true });
  const chrome =
    env.CHROME_PATH ??
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined);
  const browser = await openBrowser("chrome", {
    browserExecutable: chrome,
    logLevel: "error",
  });
  const { cancelSignal, cancel } = makeCancelSignal();
  const abort = () => cancel();
  signal.addEventListener("abort", abort, { once: true });
  const segmentKeys: Record<string, string> = {};
  try {
    const segmentsDir = path.resolve(env.MEDIA_ROOT, "v2", "segments");
    await mkdir(segmentsDir, { recursive: true });
    const paths: string[] = [];
    let runningFrame = 0;
    const timelineBeats = plan.beats.map((beat) => {
      const startFrame = runningFrame;
      runningFrame += beat.durationInFrames ?? 180;
      return { title: beat.title, startFrame };
    });
    let timelineOffsetFrames = 0;
    for (const [index, beat] of plan.beats.entries()) {
      signal.throwIfAborted();
      await onProgress(
        `Animating section ${index + 1} of ${plan.beats.length}`,
        65 + Math.floor((index / plan.beats.length) * 24),
      );
      const segmentPlan = { ...plan, beats: [beat] },
        cacheKey = hash({
          beat,
          title: plan.title,
          theme: plan.theme,
          timelineOffsetFrames,
          totalDurationFrames: planFrames(plan),
          timelineBeats,
          language: plan.language,
          captions: plan.captions,
          bundleKey,
          scale,
        });
      const file = path.join(segmentsDir, `${cacheKey}.mp4`);
      segmentKeys[beat.id] = cacheKey;
      if (!existsSync(file)) {
        const props = {
          plan: segmentPlan,
          muted: true,
          timelineOffsetFrames,
          totalDurationFrames: planFrames(plan),
          timelineBeats,
        };
        const composition = await selectComposition({
          serveUrl: url,
          id: "Explanation",
          inputProps: props,
          puppeteerInstance: browser,
        });
        const partial = path.join(work, `${cacheKey}.mp4`);
        await renderMedia({
          serveUrl: url,
          composition,
          inputProps: props,
          outputLocation: partial,
          codec: "h264",
          pixelFormat: "yuv420p",
          crf: 20,
          x264Preset: "veryfast",
          gopSize: 30,
          muted: true,
          scale,
          concurrency: 1,
          puppeteerInstance: browser,
          cancelSignal,
          logLevel: "error",
          mediaCacheSizeInBytes: 128 * 1024 * 1024,
          offthreadVideoCacheSizeInBytes: 128 * 1024 * 1024,
        });
        signal.throwIfAborted();
        await rename(partial, file);
      }
      paths.push(file);
      timelineOffsetFrames += beat.durationInFrames ?? 180;
    }
    await onProgress("Mixing narration and finishing the video", 92);
    const quote = (file: string) => file.replace(/'/gu, "'\\''");
    await writeFile(
      path.join(work, "segments.txt"),
      paths.map((file) => `file '${quote(file)}'`).join("\n"),
    );
    const duration = planFrames(plan) / 30;
    const visual = path.join(work, "visual.mp4");
    await command(
      env.FFMPEG_PATH,
      [
        "-y",
        "-v",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        path.join(work, "segments.txt"),
        "-map",
        "0:v:0",
        "-c:v",
        "copy",
        "-an",
        visual,
      ],
      signal,
    );
    const { track, verification } = await buildAudioTrack(
      plan,
      work,
      signal,
      input.requireNarration !== false,
    );
    const partial = path.join(work, "final.mp4");
    await muxVerifiedAudio(
      visual,
      track,
      partial,
      duration,
      signal,
      input.requireNarration !== false,
    );
    const probe = JSON.parse(
      await command(
        env.FFPROBE_PATH,
        [
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          partial,
        ],
        signal,
      ),
    );
    const video = probe.streams.find(
        (stream: { codec_type: string }) => stream.codec_type === "video",
      ),
      audio = probe.streams.find(
        (stream: { codec_type: string }) => stream.codec_type === "audio",
      );
    if (
      video?.codec_name !== "h264" ||
      video.width !== Math.round(1280 * scale) ||
      video.height !== Math.round(720 * scale) ||
      video.avg_frame_rate !== "30/1" ||
      audio?.codec_name !== "aac" ||
      Math.abs(Number(probe.format.duration) - duration) > 0.15
    )
      throw new Error("The rendered video did not match its media profile.");
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
      output: path.join(work, "poster.jpg"),
      imageFormat: "jpeg",
      frame: Math.min(45, (plan.beats[0].durationInFrames ?? 180) - 1),
      scale: 0.5,
      puppeteerInstance: browser,
      cancelSignal,
      logLevel: "error",
    });
    await onProgress("Saving your video", 98);
    signal.throwIfAborted();
    await writeFile(
      path.join(output, "captions.vtt"),
      captionText(plan, "vtt"),
    );
    await writeFile(
      path.join(output, "captions.srt"),
      captionText(plan, "srt"),
    );
    await writeFile(
      path.join(output, "manifest.json"),
      JSON.stringify(
        {
          fingerprint,
          audioPipeline: AUDIO_PIPELINE_VERSION,
          audioVerification: verification,
          segmentKeys,
          duration,
          profile: {
            width: 1280 * scale,
            height: 720 * scale,
            fps: 30,
            audioRate: 48000,
          },
          probe,
          timing:
            "exact whole-video timeline; measured speech; estimated subtitle chunks",
          soundDesign: plan.sound,
          soundProvenance:
            "Original procedural score and action cues generated locally",
        },
        null,
        2,
      ),
    );
    await rename(
      path.join(work, "poster.jpg"),
      path.join(output, "poster.jpg"),
    );
    await rename(partial, path.join(output, "video.mp4"));
    return { segmentKeys, duration, cached: false };
  } finally {
    signal.removeEventListener("abort", abort);
    await browser.close({ silent: true });
    await rm(work, { recursive: true, force: true });
  }
}
