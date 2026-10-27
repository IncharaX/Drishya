import type { ExplanationBeat } from "@drishya/contracts";
// biome-ignore lint/correctness/noUnusedImports: Remotion export JSX runtime.
import React from "react";
import { interpolate, spring, useCurrentFrame } from "remotion";

/** Data is the visual: positions are indexes, and each operation changes real cells. */
export function ArrayScene({
  beat,
  accent,
  ink,
  dark,
  font,
  language = "en",
}: {
  beat: ExplanationBeat;
  accent: string;
  ink: string;
  dark: boolean;
  font: string;
  language?: "en" | "hi" | "kn" | "te";
}) {
  const frame = useCurrentFrame(),
    spec = beat.visual.array;
  if (!spec) return null;
  const copy = {
    en: {
      numbers: "Numbers",
      names: "Names",
      nested: "Nested arrays",
      index: "INDEX",
      build: "One ordered collection. Every value has a position.",
      read: (i: number, v: string) => `Index ${i} points directly to ${v}.`,
      update: (v: string) => `Same position. New value: ${v}.`,
      current: (v: string) => `Current value: ${v}.`,
      iterate: (i: number, v: string) =>
        `Visit index ${i} → use value ${v} → move to the next cell.`,
    },
    hi: {
      numbers: "संख्याएँ",
      names: "नाम",
      nested: "नेस्टेड ऐरे",
      index: "इंडेक्स",
      build: "एक क्रमबद्ध संग्रह। हर मान की अपनी जगह है।",
      read: (i: number, v: string) => `इंडेक्स ${i} पर मान ${v} है।`,
      update: (v: string) => `वही स्थान। नया मान: ${v}।`,
      current: (v: string) => `वर्तमान मान: ${v}।`,
      iterate: (i: number, v: string) =>
        `इंडेक्स ${i} → मान ${v} का उपयोग → अगले स्थान पर जाएँ।`,
    },
    kn: {
      numbers: "ಸಂಖ್ಯೆಗಳು",
      names: "ಹೆಸರುಗಳು",
      nested: "ಒಳಗೊಂಡ ಅರೇಗಳು",
      index: "ಸೂಚ್ಯಂಕ",
      build: "ಕ್ರಮಬದ್ಧ ಸಂಗ್ರಹ. ಪ್ರತಿ ಮೌಲ್ಯಕ್ಕೂ ಒಂದು ಸ್ಥಾನವಿದೆ.",
      read: (i: number, v: string) => `ಸೂಚ್ಯಂಕ ${i} ರಲ್ಲಿರುವ ಮೌಲ್ಯ ${v}.`,
      update: (v: string) => `ಅದೇ ಸ್ಥಾನ. ಹೊಸ ಮೌಲ್ಯ: ${v}.`,
      current: (v: string) => `ಈಗಿನ ಮೌಲ್ಯ: ${v}.`,
      iterate: (i: number, v: string) =>
        `ಸೂಚ್ಯಂಕ ${i} → ಮೌಲ್ಯ ${v} ಬಳಸಿ → ಮುಂದಿನ ಸ್ಥಾನಕ್ಕೆ ಹೋಗಿ.`,
    },
    te: {
      numbers: "సంఖ్యలు",
      names: "పేర్లు",
      nested: "నెస్టెడ్ అరేలు",
      index: "ఇండెక్స్",
      build: "క్రమబద్ధమైన సమూహం. ప్రతి విలువకు ఒక స్థానం ఉంటుంది.",
      read: (i: number, v: string) => `ఇండెక్స్ ${i} వద్ద విలువ ${v}.`,
      update: (v: string) => `అదే స్థానం. కొత్త విలువ: ${v}.`,
      current: (v: string) => `ప్రస్తుత విలువ: ${v}.`,
      iterate: (i: number, v: string) =>
        `ఇండెక్స్ ${i} → విలువ ${v} ఉపయోగించండి → తదుపరి స్థానానికి వెళ్ళండి.`,
    },
  }[language];
  const duration = beat.durationInFrames ?? 210,
    progress = Math.max(0, Math.min(0.999, (frame - 20) / (duration - 50))),
    n = spec.items.length;
  const operation =
    spec.operation === "operations"
      ? ((["read", "update", "iterate"] as const)[
          Math.min(2, Math.floor(progress * 3))
        ] ?? "iterate")
      : spec.operation;
  const phase = spec.operation === "operations" ? (progress * 3) % 1 : progress;
  const selected =
    operation === "iterate"
      ? Math.min(n - 1, Math.floor(phase * n))
      : spec.index;
  const changed = operation === "update" && phase > 0.5;
  const cellWidth = Math.min(160, 850 / n),
    left = (1280 - cellWidth * n) / 2;
  const expression =
    operation === "read"
      ? `${spec.name}[${selected}]`
      : operation === "update"
        ? `${spec.name}[${selected}] = ${spec.replacement}`
        : operation === "iterate"
          ? `for each item in ${spec.name}`
          : `${spec.name} = [${spec.items.join(", ")}]`;
  const updated =
    changed || (spec.operation === "operations" && operation === "iterate");
  const value =
    updated && selected === spec.index
      ? spec.replacement
      : (spec.items[selected] ?? "");
  const showResult = spec.operation !== "build" && progress > 0.12;
  if (operation === "types")
    return (
      <div
        style={{
          position: "absolute",
          left: 110,
          right: 110,
          top: 210,
          fontFamily: font,
        }}
      >
        {[
          { label: copy.numbers, name: "numbers", items: spec.items },
          {
            label: copy.names,
            name: "names",
            items: ['"Asha"', '"Ravi"', '"Mira"'],
          },
          {
            label: copy.nested,
            name: "groups",
            items: ["[1, 2]", "[3, 4]", "[5, 6]"],
          },
        ].map((row, i) => {
          const reveal = spring({
            frame: frame - i * 45,
            fps: 30,
            config: { damping: 22 },
          });
          return (
            <div
              key={row.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 35,
                marginBottom: 24,
                opacity: reveal,
                transform: `translateX(${(1 - reveal) * 70}px)`,
              }}
            >
              <div style={{ width: 200, fontSize: 25, color: ink }}>
                {row.label}
                <div
                  style={{
                    fontSize: 16,
                    opacity: 0.5,
                    marginTop: 8,
                    fontFamily: "IBM Plex Mono,monospace",
                  }}
                >
                  {row.name}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {row.items.map((item, j) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: Array positions are the identities being demonstrated.
                    key={j}
                    style={{
                      width: Math.min(180, 650 / row.items.length),
                      height: 92,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 12,
                      background:
                        i === Math.min(2, Math.floor(progress * 3))
                          ? accent
                          : dark
                            ? "#24314b"
                            : "#ffffff",
                      color:
                        i === Math.min(2, Math.floor(progress * 3))
                          ? "white"
                          : ink,
                      border: `1px solid ${accent}40`,
                      fontSize: 28,
                      fontFamily: "IBM Plex Mono, monospace",
                      boxShadow: "0 12px 30px #11213c0d",
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: font }}>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 215,
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 25,
          color: ink,
          opacity: 0.8,
        }}
      >
        {expression}
      </div>
      <div
        style={{
          position: "absolute",
          left,
          top: 302,
          display: "flex",
          filter: `drop-shadow(0 20px 22px ${dark ? "#00000035" : "#233c5c12"})`,
        }}
      >
        {spec.items.map((item, i) => {
          const enter = spring({
              frame: frame - i * 6,
              fps: 30,
              config: { damping: 19 },
            }),
            active =
              operation === "build"
                ? i <= Math.floor(phase * n)
                : i === selected;
          const replacement = updated && i === spec.index;
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: Cell identity is its stable zero-based index, even when its value changes.
              key={i}
              style={{
                position: "relative",
                width: cellWidth,
                height: 122,
                opacity: enter,
                transform: `translateY(${(1 - enter) * 45}px)`,
                boxSizing: "border-box",
                background: active ? accent : dark ? "#202e43" : "#ffffff",
                border: `2px solid ${active ? accent : dark ? "#52637c" : "#c1ccd7"}`,
                borderRightWidth: i === n - 1 ? 2 : 1,
                borderRadius:
                  i === 0 ? "16px 0 0 16px" : i === n - 1 ? "0 16px 16px 0" : 0,
                display: "grid",
                placeItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "IBM Plex Mono, monospace",
                  fontSize: item.length > 10 ? 20 : 38,
                  fontWeight: 600,
                  color: active ? "#ffffff" : ink,
                  transform: `scale(${replacement ? 1 + Math.sin(Math.min(1, (phase - 0.5) * 6) * Math.PI) * 0.15 : 1})`,
                }}
              >
                {replacement ? spec.replacement : item}
              </span>
              <span
                style={{
                  position: "absolute",
                  top: 139,
                  fontSize: 20,
                  color: ink,
                  opacity: active ? 1 : 0.45,
                  fontFamily: "IBM Plex Mono, monospace",
                }}
              >
                {i}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 450,
          fontSize: 14,
          letterSpacing: 2,
          color: ink,
          opacity: 0.45,
        }}
      >
        {copy.index}
      </div>
      {spec.operation !== "build" && (
        <div
          style={{
            position: "absolute",
            left: left + selected * cellWidth + cellWidth / 2 - 10,
            top: 480,
            color: accent,
            fontSize: 28,
            transform: `translateY(${Math.sin(frame / 12) * 3}px)`,
          }}
        >
          ↑
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 110,
          right: 110,
          top: 535,
          display: "flex",
          alignItems: "center",
          gap: 22,
          opacity: interpolate(frame, [15, 30], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ height: 4, width: 40, background: accent }} />
        <div style={{ fontSize: 24, color: ink }}>
          {operation === "build"
            ? copy.build
            : operation === "read"
              ? copy.read(selected, showResult ? value : "…")
              : operation === "update"
                ? changed
                  ? copy.update(value)
                  : copy.current(value)
                : copy.iterate(selected, value)}
        </div>
      </div>
    </div>
  );
}
