import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  captionFile,
  type LocalizedStoryboard,
  type Timeline,
  VIDEO_PROFILE,
  videoFrameTimes,
} from "@drishya/contracts";
import { VideoFrame } from "@drishya/renderer";
import { chromium } from "playwright-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { env } from "../env";
import { HttpError } from "../http-error";

const require = createRequire(import.meta.url);
export const exportDirectory = (id: string) =>
  path.resolve(env.MEDIA_ROOT, "video", id);
export async function command(
  program: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "",
      stderr = "";
    const child = spawn(program, args, {
      signal,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 600_000,
    });
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-100_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-6000);
    });
    child.on("error", () =>
      reject(
        new HttpError(
          503,
          `${path.basename(program)} could not start. Check the configured executable and local installation.`,
        ),
      ),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(
            new HttpError(
              503,
              `${path.basename(program)} failed. ${stderr.slice(-1200)}`,
            ),
          ),
    );
  });
}
export async function probeAudio(assetKey: string, signal: AbortSignal) {
  const file = path.resolve(env.MEDIA_ROOT, "audio", `${assetKey}.wav`);
  const result = JSON.parse(
    await command(
      env.FFPROBE_PATH,
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
      signal,
    ),
  );
  const audio = result.streams?.find(
    (stream: { codec_type: string }) => stream.codec_type === "audio",
  );
  const duration = Number(audio?.duration ?? result.format?.duration);
  if (!audio || !Number.isFinite(duration) || duration <= 0 || duration > 600)
    throw new HttpError(
      409,
      "Scene audio is missing or invalid. Generate a fresh narration take.",
    );
  return { durationSeconds: duration, sampleRate: Number(audio.sample_rate) };
}
export async function checkRenderer() {
  await command(env.FFMPEG_PATH, ["-version"]);
  await command(env.FFPROBE_PATH, ["-version"]);
  if (env.CHROME_PATH)
    await access(env.CHROME_PATH).catch(() => {
      throw new HttpError(
        503,
        "CHROME_PATH does not point to an installed browser.",
      );
    });
}
async function fontCSS() {
  const fonts = [
    "inter",
    "instrument-serif",
    "ibm-plex-mono",
    "noto-sans-devanagari",
    "noto-sans-kannada",
    "noto-sans-telugu",
  ];
  let css = "";
  for (const font of fonts) {
    const file = require.resolve(`@fontsource/${font}/400.css`);
    let source = await readFile(file, "utf8");
    for (const match of [
      ...source.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/gu),
    ]) {
      const bytes = await readFile(path.resolve(path.dirname(file), match[1]));
      source = source.replace(
        match[0],
        `url(data:font/woff2;base64,${bytes.toString("base64")})`,
      );
    }
    css += source;
  }
  return css;
}
export async function renderVideo(input: {
  id: string;
  content: LocalizedStoryboard;
  timeline: Timeline;
  language: "en" | "hi" | "kn" | "te" | "mr";
  signal: AbortSignal;
  onProgress: (value: number) => Promise<void>;
}) {
  const { id, content, timeline, language, signal, onProgress } = input;
  const output = exportDirectory(id),
    work = path.join(output, `work-${randomUUID()}`);
  await mkdir(work, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(env.CHROME_PATH
      ? { executablePath: env.CHROME_PATH }
      : { channel: "chrome" }),
  });
  const cancel = () => {
    void browser.close();
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      javaScriptEnabled: false,
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const css = await fontCSS();
    const times = videoFrameTimes(content, timeline);
    const files: string[] = [];
    for (let index = 0; index < times.length - 1; index++) {
      signal.throwIfAborted();
      const frame = renderToStaticMarkup(
        createElement(VideoFrame, {
          content,
          timeline,
          time: times[index],
          locale: language,
        }),
      );
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>${css}html,body{margin:0;padding:0;width:1280px;height:720px;overflow:hidden}*{box-sizing:border-box}</style></head><body>${frame}</body></html>`,
        { waitUntil: "load" },
      );
      await page.evaluate(() => document.fonts.ready.then(() => true));
      const file = `${String(index).padStart(5, "0")}.png`;
      await page.screenshot({
        path: path.join(work, file),
        type: "png",
        animations: "disabled",
      });
      files.push(
        `file '${file}'\noption framerate 24\nduration ${(times[index + 1] - times[index]).toFixed(9)}`,
      );
      if (index % 8 === 0)
        await onProgress(5 + Math.floor((70 * index) / (times.length - 1)));
    }
    files.push(
      `file '${String(times.length - 2).padStart(5, "0")}.png'\noption framerate 24`,
    );
    await writeFile(path.join(work, "frames.txt"), files.join("\n"));
    await browser.close();
    await onProgress(80);
    const audioArgs = timeline.scenes.flatMap((row) => [
      "-i",
      path.resolve(env.MEDIA_ROOT, "audio", `${row.assetKey}.wav`),
    ]);
    const filters = timeline.scenes.map(
      (row, i) =>
        `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,adelay=${Math.round(row.audioStart * 1000)}|${Math.round(row.audioStart * 1000)}[a${i}]`,
    );
    filters.push(
      timeline.scenes.map((_, i) => `[a${i}]`).join("") +
        `amix=inputs=${timeline.scenes.length}:normalize=0:duration=longest,apad=whole_dur=${timeline.duration}[audio]`,
    );
    const partial = path.join(work, "partial.mp4");
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
        path.join(work, "frames.txt"),
        ...audioArgs,
        "-filter_complex",
        filters.join(";"),
        "-map",
        "0:v:0",
        "-map",
        "[audio]",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(VIDEO_PROFILE.fps),
        "-fps_mode",
        "cfr",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-t",
        String(timeline.duration),
        "-movflags",
        "+faststart",
        partial,
      ],
      signal,
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
    const video = probe.streams?.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    );
    const audio = probe.streams?.find(
      (s: { codec_type: string }) => s.codec_type === "audio",
    );
    if (
      video?.codec_name !== "h264" ||
      video.width !== 1280 ||
      video.height !== 720 ||
      video.pix_fmt !== "yuv420p" ||
      video.avg_frame_rate !== "24/1" ||
      audio?.codec_name !== "aac" ||
      Number(audio.sample_rate) !== 48000 ||
      audio.channels !== 2 ||
      Math.abs(Number(probe.format?.duration) - timeline.duration) > 0.15
    )
      throw new HttpError(
        503,
        "The encoded file did not match the video profile. Retry the export.",
      );
    await onProgress(95);
    signal.throwIfAborted();
    await writeFile(
      path.join(output, "captions.vtt"),
      captionFile(timeline, "vtt"),
    );
    await writeFile(
      path.join(output, "captions.srt"),
      captionFile(timeline, "srt"),
    );
    await writeFile(
      path.join(output, "manifest.json"),
      JSON.stringify(
        {
          profile: VIDEO_PROFILE,
          voiceoverLanguage: language,
          timeline,
          probe,
        },
        null,
        2,
      ),
    );
    const { rename } = await import("node:fs/promises");
    signal.throwIfAborted();
    await rename(partial, path.join(output, "video.mp4"));
    await onProgress(100);
  } finally {
    signal.removeEventListener("abort", cancel);
    await browser.close();
    await rm(work, { recursive: true, force: true });
  }
}

export async function completeVideo(
  id: string,
  timeline: Timeline,
  language: string,
) {
  try {
    const directory = exportDirectory(id);
    const manifest = JSON.parse(
      await readFile(path.join(directory, "manifest.json"), "utf8"),
    );
    if (
      manifest.profile?.version !== VIDEO_PROFILE.version ||
      manifest.voiceoverLanguage !== language ||
      JSON.stringify(manifest.timeline) !== JSON.stringify(timeline)
    )
      return false;
    await Promise.all(
      ["captions.vtt", "captions.srt", "video.mp4"].map((file) =>
        access(path.join(directory, file)),
      ),
    );
    const result = JSON.parse(
      await command(env.FFPROBE_PATH, [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        path.join(directory, "video.mp4"),
      ]),
    );
    const video = result.streams?.find(
        (stream: { codec_type: string }) => stream.codec_type === "video",
      ),
      audio = result.streams?.find(
        (stream: { codec_type: string }) => stream.codec_type === "audio",
      );
    return (
      video?.codec_name === "h264" &&
      video.width === 1280 &&
      video.height === 720 &&
      video.avg_frame_rate === "24/1" &&
      audio?.codec_name === "aac" &&
      Number(audio.sample_rate) === 48000 &&
      audio.channels === 2 &&
      Math.abs(Number(result.format?.duration) - timeline.duration) < 0.15
    );
  } catch {
    return false;
  }
}
