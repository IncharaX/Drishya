import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getVoices, synthesize } from "../src/speech/client";
import { audioRms } from "../src/explanations/audio";
import { env } from "../src/env";
const voices = (await getVoices()).voices;
const standardSamples = {
  en: "The sun gives plants the energy they need to grow.",
  hi: "पौधों को बढ़ने के लिए सूरज की रोशनी चाहिए।",
  kn: "ಸಸ್ಯಗಳು ಬೆಳೆಯಲು ಸೂರ್ಯನ ಬೆಳಕು ಬೇಕು.",
  te: "మొక్కలు పెరగడానికి సూర్యరశ్మి అవసరం.",
};
const samples =
  process.env.SPEECH_REGRESSION === "1"
    ? {
        en: "Your app never runs JavaScript or Python that the model wrote. Visuals come only from components you built.",
      }
    : standardSamples;
const results: Record<string, unknown>[] = [];
const directory = path.resolve(
  env.MEDIA_ROOT,
  "audio",
  process.env.SPEECH_REGRESSION === "1"
    ? "technical-pronunciation-check"
    : "verified-language-check",
);
await mkdir(directory, { recursive: true });
for (const [language, text] of Object.entries(samples)) {
  const started = Date.now();
  try {
    const voice = voices.find(
      (voice) => voice.language === language && voice.gender === "female",
    );
    assert.ok(voice);
    console.info(
      JSON.stringify({ language, status: "testing", voice: voice.label }),
    );
    const audio = await synthesize(
      text,
      language,
      voice.id,
      1,
      AbortSignal.timeout(600000),
      path.join(directory, `${language}.wav`),
    );
    const rms = await audioRms(path.join(directory, `${language}.wav`));
    assert.ok(rms > -48);
    assert.ok(audio.quality?.verified && audio.captions?.length);
    results.push({
      language,
      text,
      voice: voice.label,
      status: "passed",
      seconds: audio.durationSeconds,
      elapsedMs: Date.now() - started,
      rms,
      captions: audio.captions,
      quality: audio.quality,
    });
  } catch (error) {
    results.push({
      language,
      text,
      status: "failed",
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  console.info(JSON.stringify(results.at(-1)));
  await writeFile(
    path.join(directory, "report.json"),
    JSON.stringify(results, null, 2),
  );
}
console.info("Finished", path.join(directory, "report.json"));
if (results.some((row) => row.status !== "passed")) process.exitCode = 1;
