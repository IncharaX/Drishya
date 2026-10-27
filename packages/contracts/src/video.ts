import { z } from "zod";
import type { LocalizedStoryboard, SceneAudio } from "./speech";

export const VIDEO_PROFILE = {
  width: 1280,
  height: 720,
  fps: 24,
  audioRate: 48000,
  channels: 2,
  version: "720p-v1",
} as const;
export const timedSceneSchema = z.object({
  sceneId: z.string(),
  start: z.number(),
  end: z.number(),
  audioStart: z.number(),
  audioEnd: z.number(),
  assetKey: z.string().regex(/^[a-f0-9]{64}$/),
});
export const captionCueSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  sceneId: z.string(),
});
export const timelineSchema = z.object({
  version: z.literal("timeline-v1"),
  duration: z.number().positive(),
  scenes: z.array(timedSceneSchema).min(3).max(6),
  captions: z.array(captionCueSchema),
  captionTiming: z.literal("estimated"),
});
export type Timeline = z.infer<typeof timelineSchema>;
export const videoExportSchema = z.object({
  id: z.uuid(),
  voiceoverId: z.uuid(),
  status: z.enum(["preparing", "rendering", "ready", "failed"]),
  progress: z.number().min(0).max(100),
  timeline: timelineSchema.nullable(),
  errorMessage: z.string().nullable(),
  profile: z.string(),
  createdAt: z.iso.datetime(),
});
export type VideoExport = z.infer<typeof videoExportSchema>;
export const videoExportListSchema = z.object({
  exports: z.array(videoExportSchema),
});

// Round boundaries to whole output frames; never shorten the source audio.
export function buildTimeline(
  content: LocalizedStoryboard,
  audio: SceneAudio[],
  targetSeconds: number,
): Timeline {
  if (targetSeconds < 30 || targetSeconds > 90)
    throw new Error("The chapter target must be between 30 and 90 seconds.");
  if (
    audio.length !== content.scenes.length ||
    new Set(audio.map((a) => a.sceneId)).size !== audio.length
  )
    throw new Error("Generate one audio file for every scene first.");
  const fps = VIDEO_PROFILE.fps;
  const lead = 6 / fps,
    tail = 10 / fps;
  const measured = content.scenes.map((scene) => {
    const asset = audio.find((a) => a.sceneId === scene.id);
    if (
      !asset ||
      !Number.isFinite(asset.durationSeconds) ||
      asset.durationSeconds <= 0
    )
      throw new Error("A scene has no valid measured audio.");
    return {
      scene,
      asset,
      frames: Math.ceil((lead + asset.durationSeconds + tail) * fps),
    };
  });
  const naturalFrames = measured.reduce((sum, row) => sum + row.frames, 0);
  if (naturalFrames > Math.floor(targetSeconds * fps))
    throw new Error(
      `Narration and transitions need ${(naturalFrames / fps).toFixed(1)}s, exceeding the ${targetSeconds}s target. Shorten the narration or split this chapter into smaller objectives.`,
    );
  // A brief lesson gets quiet reading time; speech is never slowed or stretched.
  const extra = Math.max(0, 30 * fps - naturalFrames);
  let cursor = 0;
  const scenes: Timeline["scenes"] = [],
    captions: Timeline["captions"] = [];
  measured.forEach(({ scene, asset, frames }, index) => {
    const durationFrames =
      frames +
      Math.floor(extra / measured.length) +
      (index < extra % measured.length ? 1 : 0);
    const start = cursor / fps,
      end = (cursor + durationFrames) / fps;
    const audioStart = start + lead,
      audioEnd = audioStart + asset.durationSeconds;
    scenes.push({
      sceneId: scene.id,
      start,
      end,
      audioStart,
      audioEnd,
      assetKey: asset.assetKey,
    });
    // Sentence/chunk timing is proportional, not forced word alignment.
    const chunks: string[] = [];
    for (const sentence of new Intl.Segmenter(undefined, {
      granularity: "sentence",
    }).segment(scene.narration)) {
      let chunk = "";
      for (const { segment } of new Intl.Segmenter(undefined, {
        granularity: "word",
      }).segment(sentence.segment)) {
        if (chunk.length + segment.length > 76 && chunk.trim()) {
          chunks.push(chunk.trim());
          chunk = "";
        }
        chunk += segment;
      }
      if (chunk.trim()) chunks.push(chunk.trim());
    }
    const weight = chunks.reduce(
      (sum, text) => sum + Array.from(text).length,
      0,
    );
    let used = 0;
    chunks.forEach((text, i) => {
      const cueStart = audioStart + (asset.durationSeconds * used) / weight;
      used += Array.from(text).length;
      captions.push({
        sceneId: scene.id,
        text,
        start: cueStart,
        end:
          i === chunks.length - 1
            ? audioEnd
            : audioStart + (asset.durationSeconds * used) / weight,
      });
    });
    cursor += durationFrames;
  });
  return timelineSchema.parse({
    version: "timeline-v1",
    duration: cursor / fps,
    scenes,
    captions,
    captionTiming: "estimated",
  });
}
export function timelinePosition(timeline: Timeline, time: number) {
  const sceneIndex = Math.max(
    0,
    timeline.scenes.findIndex(
      (scene) => time >= scene.start && time < scene.end,
    ),
  );
  const row =
    time >= timeline.duration
      ? timeline.scenes[timeline.scenes.length - 1]
      : timeline.scenes[sceneIndex];
  const index =
    time >= timeline.duration ? timeline.scenes.length - 1 : sceneIndex;
  return {
    index,
    scene: row,
    progress: Math.max(
      0,
      Math.min(1, (time - row.audioStart) / (row.audioEnd - row.audioStart)),
    ),
    caption:
      timeline.captions.find((cue) => time >= cue.start && time < cue.end)
        ?.text ?? "",
  };
}
export function captionFile(timeline: Timeline, format: "vtt" | "srt") {
  const stamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${format === "vtt" ? "." : ","}${String(ms % 1000).padStart(3, "0")}`;
  };
  return (
    (format === "vtt" ? "WEBVTT\n\n" : "") +
    timeline.captions
      .map(
        (cue, i) =>
          `${i + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text.replace(/-->/gu, "→").replace(/[<>]/gu, "")}\n`,
      )
      .join("\n")
  );
}

// Capture only visual changes; FFmpeg repeats still frames at the standard 24 fps.
export function videoFrameTimes(
  content: LocalizedStoryboard,
  timeline: Timeline,
) {
  const fps = VIDEO_PROFILE.fps;
  const total = Math.round(timeline.duration * fps);
  const frames = new Set<number>([0, total]);
  const add = (time: number) =>
    frames.add(Math.min(total, Math.max(0, Math.ceil(time * fps - 1e-7))));
  timeline.scenes.forEach((row, i) => {
    add(row.start);
    add(row.end);
    add(row.audioStart);
    add(row.audioEnd);
    const scene = content.scenes[i];
    const count =
      scene.type === "title"
        ? scene.bullets.length
        : scene.type === "diagram"
          ? scene.nodes.length
          : scene.focusLines.length;
    for (let n = 0; n < count; n++)
      add(
        row.audioStart +
          ((row.audioEnd - row.audioStart) * n) / Math.max(1, count),
      );
    for (let frame = 0; frame <= 6; frame++) {
      add(row.start + frame / fps);
      add(row.end - frame / fps);
    }
  });
  timeline.captions.forEach((cue) => {
    add(cue.start);
    add(cue.end);
  });
  return [...frames].sort((a, b) => a - b).map((frame) => frame / fps);
}
