import assert from "node:assert/strict";
import path from "node:path";
import { getVoices, synthesize } from "../src/speech/client";
import { audioRms } from "../src/explanations/audio";
import { env } from "../src/env";
const voices = (await getVoices()).voices;
const samples = {
  en: "A clear explanation helps us understand how things work.",
  hi: "एक अच्छा उदाहरण हमें नई बात समझने में मदद करता है।",
  kn: "ಒಂದು ಒಳ್ಳೆಯ ಉದಾಹರಣೆ ಹೊಸ ವಿಷಯವನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಸಹಾಯ ಮಾಡುತ್ತದೆ.",
  te: "ఒక మంచి ఉదాహరణ కొత్త విషయాన్ని అర్థం చేసుకోవడానికి సహాయపడుతుంది.",
};
for (const [language, text] of Object.entries(samples)) {
  const voice = voices.find(
    (v) => v.language === language && v.gender === "female",
  );
  assert.ok(voice, language);
  const audio = await synthesize(
    text,
    language,
    voice.id,
    1,
    AbortSignal.timeout(300000),
  );
  assert.ok(audio.durationSeconds > 1);
  const rms = await audioRms(
    path.resolve(env.MEDIA_ROOT, "audio", `${audio.assetKey}.wav`),
  );
  assert.ok(rms > -48);
  console.info(
    JSON.stringify({
      language,
      voice: voice.label,
      seconds: audio.durationSeconds,
      rms,
      assetKey: audio.assetKey,
      cached: audio.cached,
    }),
  );
}
