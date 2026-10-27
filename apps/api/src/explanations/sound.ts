import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { type MotionPlan, planFrames } from "@drishya/contracts";
import { env } from "../env";

const rate = 32000;
// Original procedural score and effects. No downloaded samples or external APIs.
export async function ensureSoundtrack(
  plan: MotionPlan,
): Promise<string | null> {
  const design = plan.sound;
  if (
    !design ||
    design.mood === "none" ||
    (design.music === 0 && design.effects === 0)
  )
    return null;
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        version: 2,
        sound: design,
        beats: plan.beats.map((beat) => ({
          kind: beat.visual.kind,
          nodes: beat.visual.nodes.length,
          frames: beat.durationInFrames,
          audio: beat.audioDuration,
          rate: beat.audioPlaybackRate,
        })),
      }),
    )
    .digest("hex");
  const directory = path.resolve(env.MEDIA_ROOT, "v2", "sound"),
    target = path.join(directory, `${key}.wav`);
  try {
    await access(target);
    return target;
  } catch {}
  await mkdir(directory, { recursive: true });
  const temp = path.join(directory, `${randomUUID()}.wav`),
    file = await open(temp, "w");
  const duration = planFrames(plan) / 30,
    count = Math.ceil(duration * rate),
    bytes = count * 4;
  if (bytes > 0xffffffff - 44)
    throw new Error("Soundtrack exceeds the WAV file limit.");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(bytes + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(bytes, 40);
  const speech: { start: number; end: number }[] = [],
    cues: { at: number; kind: "air" | "click" | "bell" }[] = [];
  let cursor = 0;
  for (const beat of plan.beats) {
    const length = (beat.durationInFrames ?? 180) / 30;
    speech.push({
      start: cursor + 0.2,
      end:
        cursor +
        0.2 +
        (beat.audioDuration ?? 0) / (beat.audioPlaybackRate ?? 1),
    });
    cues.push({ at: cursor + 0.12, kind: "air" });
    for (let i = 0; i < beat.visual.nodes.length; i++)
      cues.push({
        at:
          cursor +
          0.4 +
          (i * (length - 0.8)) / Math.max(1, beat.visual.nodes.length),
        kind:
          beat.visual.kind === "process" || beat.visual.kind === "code"
            ? "click"
            : "bell",
      });
    cursor += length;
  }
  const root = {
    calm: 130.8128,
    curious: 146.8324,
    tech: 110,
    cinematic: 73.4162,
    dramatic: 65.4064,
    none: 130.8128,
  }[design.mood];
  const minor =
    design.mood === "cinematic" ||
    design.mood === "dramatic" ||
    design.mood === "tech";
  const notes = [1, minor ? 1.1892 : 1.2599, 1.4983, 2];
  try {
    await file.write(header);
    for (let start = 0; start < count; start += 4096) {
      const frames = Math.min(4096, count - start),
        buffer = Buffer.alloc(frames * 4);
      for (let index = 0; index < frames; index++) {
        const t = (start + index) / rate,
          fade = Math.min(1, t / 1.5, (duration - t) / 1.5),
          voice = speech.some((range) => t >= range.start && t <= range.end),
          duck = voice ? 0.55 : 0.8;
        const pulse =
          design.mood === "tech"
            ? 0.75 + 0.25 * Math.cos(t * 2 * Math.PI * 1.1)
            : 1;
        let left = 0,
          right = 0;
        notes.forEach((note, n) => {
          const f = root * note;
          const swell = 0.65 + 0.35 * Math.sin(t * 0.27 + n);
          left +=
            (Math.sin(t * f * Math.PI * 2 + 0.02 * Math.sin(t * 0.8)) * swell) /
            notes.length;
          right +=
            (Math.sin(t * (f + 0.13) * Math.PI * 2) * swell) / notes.length;
        });
        left *= design.music * 1.0 * duck * fade * pulse;
        right *= design.music * 1.0 * duck * fade * pulse;
        for (const cue of cues) {
          const dt = t - cue.at;
          if (dt < 0 || dt > 0.38) continue;
          const envelope =
            Math.exp(-dt * (cue.kind === "click" ? 65 : 14)) *
            Math.min(1, dt * 500);
          const f =
            cue.kind === "click" ? 580 : cue.kind === "bell" ? root * 8 : 180;
          const value =
            Math.sin(
              2 * Math.PI * (f * dt + (cue.kind === "air" ? 550 * dt * dt : 0)),
            ) *
            envelope *
            design.effects *
            0.18 *
            fade;
          left += value;
          right += value * 0.8;
        }
        buffer.writeInt16LE(
          Math.round(Math.max(-1, Math.min(1, left)) * 32767),
          index * 4,
        );
        buffer.writeInt16LE(
          Math.round(Math.max(-1, Math.min(1, right)) * 32767),
          index * 4 + 2,
        );
      }
      await file.write(buffer);
    }
    await file.close();
    await rename(temp, target);
    return target;
  } catch (error) {
    await file.close().catch(() => {});
    await rm(temp, { force: true });
    throw error;
  }
}
