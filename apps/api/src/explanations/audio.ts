import path from "node:path";
import { type MotionPlan, planFrames } from "@drishya/contracts";
import { env } from "../env";
import { command } from "../video/render";
import { ensureSoundtrack } from "./sound";

export const AUDIO_PIPELINE_VERSION = "isolated-aac-clock-v1";
export async function mediaProbe(file: string, signal?: AbortSignal) {
  return JSON.parse(
    await command(
      env.FFPROBE_PATH,
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
      signal,
    ),
  );
}
export async function audioRms(file: string, signal?: AbortSignal) {
  const output = await command(
    env.FFMPEG_PATH,
    [
      "-v",
      "error",
      "-i",
      file,
      "-map",
      "0:a:0",
      "-af",
      "astats=metadata=1:reset=0,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-",
      "-f",
      "null",
      "-",
    ],
    signal,
  );
  const values = [
    ...output.matchAll(/lavfi\.astats\.Overall\.RMS_level=([^\s]+)/gu),
  ];
  return values.length ? Number(values.at(-1)?.[1]) : Number.NEGATIVE_INFINITY;
}
export async function validateAudio(
  file: string,
  duration: number,
  requireSpeech: boolean,
  signal?: AbortSignal,
) {
  const probe = await mediaProbe(file, signal),
    audio = probe.streams?.find(
      (stream: { codec_type: string }) => stream.codec_type === "audio",
    );
  const length = Number(audio?.duration ?? probe.format?.duration);
  if (!audio || !Number.isFinite(length) || Math.abs(length - duration) > 0.15)
    throw new Error(
      `Audio verification failed: expected ${duration.toFixed(2)} seconds, found ${Number.isFinite(length) ? length.toFixed(3) : "no audio"}.`,
    );
  const rms = await audioRms(file, signal);
  if (requireSpeech && (!Number.isFinite(rms) || rms < -48))
    throw new Error(
      `Narration verification failed: audio is silent or inaudible (${rms.toFixed(1)} dB).`,
    );
  return { duration: length, rmsDb: rms };
}
export async function buildAudioTrack(
  plan: MotionPlan,
  work: string,
  signal: AbortSignal,
  requireNarration = true,
) {
  const duration = planFrames(plan) / 30,
    beats = plan.beats.filter((beat) => beat.audioKey);
  if (requireNarration && beats.length !== plan.beats.length)
    throw new Error(
      "Every explanation section needs verified narration before export.",
    );
  // Materialize normalized PCM before mixing: loudnorm changes its internal
  // sample rate, and must not pass that clock directly into amix.
  const normalized: string[] = [];
  for (const [index, beat] of beats.entries()) {
    const file = path.join(work, `voice-${index}.wav`);
    await command(
      env.FFMPEG_PATH,
      [
        "-y",
        "-v",
        "error",
        "-i",
        path.resolve(env.MEDIA_ROOT, "audio", `${beat.audioKey}.wav`),
        "-af",
        `atempo=${beat.audioPlaybackRate ?? 1},loudnorm=I=-16:TP=-1.5:LRA=9`,
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        file,
      ],
      signal,
    );
    const probe = await mediaProbe(file, signal);
    const rms = await audioRms(file, signal),
      length = Number(probe.format?.duration);
    if (
      !Number.isFinite(length) ||
      length < 0.3 ||
      !Number.isFinite(rms) ||
      rms < -48
    )
      throw new Error(`Narration section ${beat.id} is empty or inaudible.`);
    normalized.push(file);
  }
  const inputs = normalized.flatMap((file) => ["-i", file]);
  const filters: string[] = [];
  let cursor = 0;
  for (const beat of plan.beats) {
    const index = beats.findIndex((item) => item.id === beat.id);
    if (index >= 0)
      filters.push(
        `[${index}:a]adelay=${Math.round((cursor + 0.2) * 1000)}:all=1[a${index}]`,
      );
    cursor += (beat.durationInFrames ?? 180) / 30;
  }
  const voice = path.join(work, "narration.wav");
  if (beats.length) {
    filters.push(
      beats.map((_, index) => `[a${index}]`).join("") +
        `amix=inputs=${beats.length}:normalize=0,apad=whole_dur=${duration},atrim=duration=${duration}[voice]`,
    );
    await command(
      env.FFMPEG_PATH,
      [
        "-y",
        "-v",
        "error",
        ...inputs,
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[voice]",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-t",
        String(duration),
        voice,
      ],
      signal,
    );
    await validateAudio(voice, duration, true, signal);
  } else
    await command(
      env.FFMPEG_PATH,
      [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=48000:cl=stereo",
        "-t",
        String(duration),
        voice,
      ],
      signal,
    );
  const bed = await ensureSoundtrack(plan),
    track = path.join(work, "soundtrack.m4a");
  const mix = bed
    ? [
        "-i",
        bed,
        "-filter_complex",
        `[0:a][1:a]amix=inputs=2:normalize=0,atrim=duration=${duration}[mix]`,
        "-map",
        "[mix]",
      ]
    : [];
  // Encode AAC without a concat/video input. The audio sample clock stays independent of video time bases.
  await command(
    env.FFMPEG_PATH,
    [
      "-y",
      "-v",
      "error",
      "-i",
      voice,
      ...mix,
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-enc_time_base:a",
      "1/48000",
      "-t",
      String(duration),
      track,
    ],
    signal,
  );
  const verification = await validateAudio(
    track,
    duration,
    requireNarration,
    signal,
  );
  return { track, verification };
}
export async function muxVerifiedAudio(
  video: string,
  track: string,
  output: string,
  duration: number,
  signal: AbortSignal,
  requireSpeech = true,
) {
  await command(
    env.FFMPEG_PATH,
    [
      "-y",
      "-v",
      "error",
      "-i",
      video,
      "-i",
      track,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c",
      "copy",
      "-t",
      String(duration),
      "-movflags",
      "+faststart",
      output,
    ],
    signal,
  );
  return validateAudio(output, duration, requireSpeech, signal);
}
