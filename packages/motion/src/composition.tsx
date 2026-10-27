import {
  type ExplanationBeat,
  type MotionPlan,
  planFrames,
} from "@drishya/contracts";
// biome-ignore lint/correctness/noUnusedImports: Required by the export bundler JSX transformation.
import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
} from "remotion";
import { DirectedScene } from "./directed";
import { ArrayScene } from "./array";
import { SpaceScene } from "./space";

export type MotionProps = {
  plan: MotionPlan;
  audioSources?: Record<string, string>;
  muted?: boolean;
  timelineOffsetFrames?: number;
  totalDurationFrames?: number;
  timelineBeats?: { title: string; startFrame: number }[];
  bedAudioSource?: string;
};
const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
const font =
  "Inter, Noto Sans Devanagari, Noto Sans Kannada, Noto Sans Telugu, sans-serif";
function light(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return (
    (value >> 16) * 0.299 +
      ((value >> 8) & 255) * 0.587 +
      (value & 255) * 0.114 >
    155
  );
}
function Comparison({
  beat,
  accent,
  ink,
  dark,
}: {
  beat: ExplanationBeat;
  accent: string;
  ink: string;
  dark: boolean;
}) {
  const frame = useCurrentFrame(),
    nodes = beat.visual.nodes.slice(0, 4),
    maximum = Math.max(1, ...nodes.map((n) => n.value ?? 1));
  return (
    <div
      style={{
        position: "absolute",
        left: 100,
        right: 100,
        top: 235,
        bottom: 145,
        display: "flex",
        gap: 28,
        alignItems: "stretch",
      }}
    >
      {nodes.map((node, i) => {
        const reveal = spring({
          frame: frame - 10 - i * 8,
          fps: 30,
          config: { damping: 20 },
        });
        const height =
          node.value !== undefined
            ? Math.max(10, (node.value / maximum) * 130)
            : 90;
        return (
          <div
            key={node.id}
            style={{
              flex: 1,
              position: "relative",
              padding: "30px 26px",
              borderRadius: 24,
              background: dark ? "#15223b" : "#ffffff",
              border: `1px solid ${dark ? "#2a3a56" : "#dfe6ef"}`,
              transform: `translateY(${(1 - reveal) * 45}px)`,
              opacity: reveal,
              overflow: "hidden",
            }}
          >
            <div style={{ fontSize: 14, color: accent, marginBottom: 20 }}>
              0{i + 1}
            </div>
            <div
              style={{
                position: "absolute",
                right: 20,
                top: 30,
                width: 70,
                height: 70,
                background: accent,
                borderRadius: beat.visual.kind === "cause" ? "18px" : "50%",
                opacity: 0.12,
                transform: `rotate(${frame * 0.4 + i * 20}deg) scale(${0.95 + Math.sin(frame / 25 + i) * 0.05})`,
              }}
            />
            <h3
              style={{
                fontSize: 27,
                fontWeight: 650,
                margin: "0 0 14px",
                color: ink,
              }}
            >
              {node.label}
            </h3>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.5,
                color: ink,
                opacity: 0.65,
                margin: 0,
              }}
            >
              {node.detail}
            </p>
            {beat.visual.kind === "chart" ? (
              <div
                style={{
                  position: "absolute",
                  left: 26,
                  right: 26,
                  bottom: 22,
                  height: 140,
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: height * reveal,
                    background: node.color ?? accent,
                    borderRadius: "10px 10px 3px 3px",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    bottom: height * reveal + 6,
                    fontSize: 23,
                    color: ink,
                  }}
                >
                  {node.value}
                </span>
              </div>
            ) : (
              <div
                style={{
                  position: "absolute",
                  bottom: 25,
                  left: 26,
                  right: 26,
                  height: 3,
                  background: accent,
                  transformOrigin: "left",
                  transform: `scaleX(${reveal})`,
                  opacity: 0.6,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
function Code({
  beat,
  accent,
  ink,
  dark,
}: {
  beat: ExplanationBeat;
  accent: string;
  ink: string;
  dark: boolean;
}) {
  const frame = useCurrentFrame(),
    lines = beat.visual.code.split("\n").slice(0, 12),
    active = Math.min(
      lines.length - 1,
      Math.floor(
        frame /
          Math.max(
            12,
            (beat.durationInFrames ?? 210) / Math.max(1, lines.length),
          ),
      ),
    );
  return (
    <div
      style={{
        position: "absolute",
        left: 110,
        right: 110,
        top: 210,
        bottom: 150,
        borderRadius: 25,
        background: dark ? "#101a2d" : "#ffffff",
        border: `1px solid ${dark ? "#2d3c55" : "#dfe6ef"}`,
        padding: 30,
        boxShadow: "0 20px 70px #00000012",
      }}
    >
      <div style={{ display: "flex", gap: 7, marginBottom: 24 }}>
        {["#f48585", "#efd48c", "#92d6ab"].map((c) => (
          <span
            key={c}
            style={{ width: 9, height: 9, borderRadius: 20, background: c }}
          />
        ))}
      </div>
      {lines.map((line, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: Code lines are immutable within a saved revision and repeated blank lines need distinct keys.
          key={`${i}-${line}`}
          style={{
            display: "flex",
            gap: 25,
            padding: "5px 12px",
            fontFamily: "monospace",
            fontSize: 22,
            whiteSpace: "pre",
            color: ink,
            background: i === active ? `${accent}22` : "transparent",
            borderLeft: `3px solid ${i === active ? accent : "transparent"}`,
          }}
        >
          <span style={{ opacity: 0.3, minWidth: 25 }}>{i + 1}</span>
          {line.slice(0, 80)}
        </div>
      ))}
    </div>
  );
}
function Captions({ beat, ink }: { beat: ExplanationBeat; ink: string }) {
  const frame = useCurrentFrame();
  const words = beat.narration.split(/\s+/u),
    chunks: string[] = [];
  let text = "";
  for (const word of words) {
    if ((text + word).length > 70 && text) {
      chunks.push(text.trim());
      text = "";
    }
    text += `${word} `;
  }
  if (text) chunks.push(text.trim());
  const duration = Math.max(
    1,
    (beat.audioDuration ?? (beat.durationInFrames ?? 180) / 30) * 30,
  );
  const index = Math.min(
    chunks.length - 1,
    Math.floor((Math.max(0, frame - 6) / duration) * chunks.length),
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 100,
        right: 100,
        bottom: 76,
        textAlign: "center",
        fontSize: 22,
        lineHeight: 1.45,
        color: ink,
        opacity: frame < 6 ? 0 : 0.86,
      }}
    >
      {chunks[index]}
    </div>
  );
}
export function MotionShot({
  beat,
  plan,
}: {
  beat: ExplanationBeat;
  plan: MotionPlan;
}) {
  const frame = useCurrentFrame(),
    duration = beat.durationInFrames ?? 210;
  const shotTheme = { ...plan.theme, ...beat.theme };
  const selectedFont = {
    inter: "Inter",
    serif: "Instrument Serif",
    mono: "IBM Plex Mono",
    manrope: "Manrope",
  }[shotTheme.font ?? "inter"];
  const videoFont = `${selectedFont}, Noto Sans Devanagari, Noto Sans Kannada, Noto Sans Telugu, sans-serif`;
  const dark = !light(shotTheme.background),
    ink = dark ? "#edf3ff" : shotTheme.ink,
    accent = shotTheme.accent;
  const enter = spring({
      frame,
      fps: 30,
      config: { damping: 22, stiffness: 130 },
    }),
    fade = interpolate(
      frame,
      [0, 7, duration - 6, duration],
      [0, 1, 1, 0],
      clamp,
    );
  const spatial = beat.visual.kind === "solar";
  return (
    <AbsoluteFill
      style={{
        background: shotTheme.background,
        color: ink,
        fontFamily: videoFont,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          right: -250,
          top: -430,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}18, transparent 68%)`,
          transform: `translate(${Math.sin(frame / 100) * 20}px,${Math.cos(frame / 90) * 15}px)`,
        }}
      />
      {spatial && (
        <div style={{ position: "absolute", inset: 0, opacity: fade }}>
          <SpaceScene beat={beat} />
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, opacity: fade }}>
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 70,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 15,
            color: ink,
            opacity: 0.55,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 10,
              background: accent,
            }}
          />
          Drishya
          <span
            style={{ width: 25, height: 1, background: ink, opacity: 0.4 }}
          />
          {plan.title}
        </div>
        <div
          style={{
            position: "absolute",
            top: spatial ? 110 : 102,
            left: 70,
            right: spatial ? 780 : 90,
            transform: `translateY(${(1 - enter) * 28}px)`,
            zIndex: 2,
          }}
        >
          <h1
            style={{
              fontSize: spatial ? 48 : 44,
              fontWeight: shotTheme.font === "serif" ? 400 : 650,
              lineHeight: 1.12,
              letterSpacing: -1.5,
              margin: 0,
            }}
          >
            {beat.title}
          </h1>
          {spatial && (
            <div
              style={{
                marginTop: 30,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {beat.visual.nodes.slice(0, 5).map((node, i) => (
                <div
                  key={node.id}
                  style={{
                    fontSize: 19,
                    opacity: interpolate(
                      frame,
                      [i * 12, i * 12 + 15],
                      [0.1, 0.85],
                      clamp,
                    ),
                    display: "flex",
                    gap: 13,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      height: 6,
                      width: 6,
                      borderRadius: 10,
                      background: node.color ?? accent,
                    }}
                  />
                  {node.label}
                </div>
              ))}
            </div>
          )}
        </div>
        {beat.visual.kind === "array" ? (
          <ArrayScene
            language={plan.language}
            beat={beat}
            accent={accent}
            ink={ink}
            dark={dark}
            font={videoFont}
          />
        ) : beat.visual.kind === "code" ? (
          <Code beat={beat} accent={accent} ink={ink} dark={dark} />
        ) : beat.visual.kind === "solar" ? null : beat.visual.kind ===
            "chart" && beat.visual.dimension !== "3d" ? (
          <Comparison beat={beat} accent={accent} ink={ink} dark={dark} />
        ) : beat.visual.kind === "comparison" &&
          beat.visual.dimension !== "3d" ? (
          <Comparison beat={beat} accent={accent} ink={ink} dark={dark} />
        ) : (
          <DirectedScene
            beat={beat}
            accent={accent}
            ink={ink}
            dark={dark}
            font={videoFont}
          />
        )}
        {spatial && (
          <div
            style={{
              position: "absolute",
              bottom: 104,
              right: 60,
              fontSize: 13,
              opacity: 0.4,
            }}
          >
            Schematic illustration
          </div>
        )}
        {plan.captions && <Captions beat={beat} ink={ink} />}
      </div>
    </AbsoluteFill>
  );
}
export function ExplanationComposition({
  plan,
  audioSources = {},
  muted = false,
  timelineOffsetFrames = 0,
  totalDurationFrames,
  timelineBeats,
  bedAudioSource,
}: MotionProps) {
  let cursor = 0;
  const frame = useCurrentFrame(),
    total = totalDurationFrames ?? planFrames(plan);
  let offset = 0;
  const markers =
    timelineBeats ??
    plan.beats.map((beat) => {
      const startFrame = offset;
      offset +=
        beat.durationInFrames ??
        Math.ceil(((beat.audioDuration ?? 6) + 0.5) * 30);
      return { title: beat.title, startFrame };
    });
  let seek = 0;
  const activeBeat = plan.beats.find((beat) => {
    const start = seek;
    seek += beat.durationInFrames ?? 180;
    return frame >= start && frame < seek;
  });
  const timelineTheme = { ...plan.theme, ...activeBeat?.theme };
  const current = Math.min(total - 1, frame + timelineOffsetFrames),
    time = (n: number) =>
      `${Math.floor(n / 30 / 60)}:${String(Math.floor(n / 30) % 60).padStart(2, "0")}`;
  return (
    <AbsoluteFill style={{ background: plan.theme.background }}>
      {plan.beats.map((beat) => {
        const from = cursor,
          duration =
            beat.durationInFrames ??
            Math.ceil(((beat.audioDuration ?? 6) + 0.5) * plan.fps);
        cursor += duration;
        return (
          <Sequence
            key={beat.id}
            from={from}
            durationInFrames={duration}
            name={beat.title}
            premountFor={15}
          >
            <MotionShot
              beat={{ ...beat, durationInFrames: duration }}
              plan={plan}
            />
            {!muted && audioSources[beat.id] && (
              <Sequence from={6}>
                <Audio
                  src={audioSources[beat.id]}
                  playbackRate={beat.audioPlaybackRate ?? 1}
                />
              </Sequence>
            )}
          </Sequence>
        );
      })}
      {!muted && bedAudioSource && <Audio src={bedAudioSource} />}
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          bottom: 21,
          color: timelineTheme.ink,
          fontFamily: "Inter, sans-serif",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              height: 2,
              background: `${timelineTheme.ink}26`,
              position: "relative",
              flex: 1,
            }}
          >
            <div
              style={{
                height: 2,
                width: `${Math.min(100, (current / Math.max(1, total - 1)) * 100)}%`,
                background: timelineTheme.accent,
              }}
            />
            {markers.slice(1).map((marker) => (
              <span
                key={marker.startFrame}
                style={{
                  position: "absolute",
                  left: `${(marker.startFrame / total) * 100}%`,
                  top: -2,
                  width: 1,
                  height: 6,
                  background: timelineTheme.ink,
                  opacity: 0.3,
                }}
              />
            ))}
          </div>
          <span
            style={{
              fontSize: 12,
              opacity: 0.6,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {time(current)} / {time(total)}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
export { planFrames };
