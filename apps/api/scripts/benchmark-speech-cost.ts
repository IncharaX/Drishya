import { getVoices, synthesize } from "../src/speech/client";

const voices = (await getVoices()).voices;
const sentences = {
  en: "A leaf uses sunlight to turn water and carbon dioxide into sugar. Oxygen is released into the air.",
  hi: "पत्तियाँ सूर्य के प्रकाश की मदद से पानी और कार्बन डाइऑक्साइड से भोजन बनाती हैं।",
  kn: "ಎಲೆಗಳು ಸೂರ್ಯನ ಬೆಳಕನ್ನು ಬಳಸಿ ನೀರು ಮತ್ತು ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್‌ನಿಂದ ಆಹಾರವನ್ನು ತಯಾರಿಸುತ್ತವೆ.",
  te: "ఆకులు సూర్యరశ్మిని ఉపయోగించి నీరు మరియు కార్బన్ డయాక్సైడ్ నుంచి ఆహారం తయారు చేస్తాయి.",
};
for (const [language, text] of Object.entries(sentences)) {
  const voice = voices.find((item) => item.language === language);
  if (!voice) throw new Error(language);
  const started = Date.now(),
    audio = await synthesize(
      text,
      language,
      voice.id,
      1,
      AbortSignal.timeout(600000),
    );
  console.info(
    JSON.stringify({
      language,
      elapsedMs: Date.now() - started,
      durationSeconds: audio.durationSeconds,
      cached: audio.cached,
      telemetry: audio.telemetry,
    }),
  );
}
