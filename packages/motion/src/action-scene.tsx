import type { ExplanationBeat } from "@drishya/contracts";
// biome-ignore lint/correctness/noUnusedImports: Export bundler JSX runtime.
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
/** Deterministic artifact operations, driven by narration-relative cue positions. */
export function ActionScene({
  beat,
  accent,
  ink,
  dark,
  font,
}: {
  beat: ExplanationBeat;
  accent: string;
  ink: string;
  dark: boolean;
  font: string;
}) {
  const frame = useCurrentFrame(),
    actions = beat.visual.actions ?? [];
  const duration = beat.durationInFrames ?? 210;
  const spokenFrames = Math.min(
    duration - 8,
    Math.round(
      ((beat.audioDuration ?? duration / 30) / (beat.audioPlaybackRate ?? 1)) *
        30,
    ),
  );
  const starts = actions.map((action, index) =>
    Math.round((action.at ?? index / actions.length) * spokenFrames),
  );
  const index = starts.reduce(
    (current, start, index) => (frame >= start ? index : current),
    0,
  );
  const action = actions[index];
  if (!action) return null;
  const start = starts[index],
    end = starts[index + 1] ?? spokenFrames;
  const progress = interpolate(
    frame,
    [start, Math.max(start + 1, end - 3)],
    [0, 1],
    clamp,
  );
  const eased = 1 - Math.pow(1 - progress, 3);
  const subject =
    beat.visual.nodes.find((node) => node.id === action.subjectId) ??
    beat.visual.nodes[0];
  const target =
    beat.visual.nodes.find((node) => node.id === action.targetId) ?? subject;
  const surface = dark ? "#172335" : "#ffffff",
    muted = dark ? "#b3c0d2" : "#52616d";
  const moving =
    action.operation === "transfer" || action.operation === "transform";
  const previous = actions
    .slice(0, index)
    .some((item) => item.targetId === target.id);
  const targetVisible =
    previous || action.operation === "compare" || progress > 0.48;
  const detail = subject.detail || subject.label;
  const typed =
    action.operation === "type"
      ? detail.slice(0, Math.floor(detail.length * progress))
      : detail;
  const single = subject.id === target.id;
  const railIds = new Set([
    subject.id,
    target.id,
    ...beat.visual.nodes
      .filter((node) => node.id !== subject.id && node.id !== target.id)
      .slice(0, 2)
      .map((node) => node.id),
  ]);
  return (
    <div
      style={{ position: "absolute", inset: 0, fontFamily: font, color: ink }}
    >
      <div
        style={{
          position: "absolute",
          left: 76,
          top: 192,
          right: 76,
          display: "flex",
          gap: 10,
        }}
      >
        {beat.visual.nodes
          .filter((node) => railIds.has(node.id))
          .map((node) => (
            <div
              key={node.id}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "10px 12px",
                borderBottom: `3px solid ${node.id === subject.id || node.id === target.id ? accent : dark ? "#304054" : "#d9e1e6"}`,
                fontSize: 17,
                fontWeight: 600,
                opacity:
                  node.id === subject.id || node.id === target.id ? 1 : 0.45,
              }}
            >
              {node.label}
            </div>
          ))}
      </div>
      {[
        { node: subject, left: single ? 300 : 86, isTarget: false },
        ...(single ? [] : [{ node: target, left: 734, isTarget: true }]),
      ].map(({ node, left, isTarget }) => (
        <div
          key={isTarget ? "target" : "source"}
          style={{
            position: "absolute",
            left,
            top: 272,
            width: single ? 680 : 460,
            height: 260,
            padding: 26,
            boxSizing: "border-box",
            borderRadius: 18,
            background: surface,
            border: `1.5px solid ${accent}55`,
            boxShadow: `0 18px 42px ${dark ? "#00000033" : "#1733490e"}`,
            opacity: isTarget
              ? interpolate(
                  progress,
                  [0.35, 0.65],
                  [previous ? 1 : 0.35, 1],
                  clamp,
                )
              : action.operation === "reveal"
                ? eased
                : 1,
            transform: `translateY(${isTarget ? (1 - eased) * 10 : 0}px)`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              marginBottom: 18,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 8,
                background: accent,
              }}
            />
            <span style={{ fontSize: 19, fontWeight: 650, lineHeight: 1.2 }}>
              {node.label}
            </span>
          </div>
          <div
            style={{
              fontSize: 20,
              lineHeight: 1.5,
              color: muted,
              overflowWrap: "anywhere",
            }}
          >
            {isTarget
              ? targetVisible
                ? node.detail || node.label
                : ""
              : typed}
            {!isTarget && action.operation === "type" && progress < 1 ? (
              <span
                style={{ color: accent, opacity: Math.floor(frame / 10) % 2 }}
              >
                ▍
              </span>
            ) : null}
          </div>
          {isTarget && action.operation === "transform" && (
            <div
              style={{
                position: "absolute",
                bottom: 22,
                left: 26,
                right: 26,
                height: 5,
                borderRadius: 5,
                background: `${accent}22`,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress * 100}%`,
                  background: accent,
                  borderRadius: 5,
                }}
              />
            </div>
          )}
        </div>
      ))}
      {action.label && (
        <div
          style={{
            position: "absolute",
            left: 550,
            top: 294,
            width: 180,
            textAlign: "center",
            fontSize: 14,
            lineHeight: 1.3,
            color: ink,
          }}
        >
          {action.label}
        </div>
      )}
      {moving && (
        <div
          style={{
            position: "absolute",
            // Keep the moving artifact in the gutter, clear of both text panels.
            left: 552 + eased * 86,
            top: 350,
            width: 92,
            height: 74,
            borderRadius: 12,
            background: accent,
            color: dark ? "#101c29" : "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 31,
            boxShadow: `0 12px 28px ${accent}33`,
            opacity: interpolate(
              progress,
              [0, 0.12, 0.85, 1],
              [0, 1, 1, 0],
              clamp,
            ),
            transform: `scale(${action.operation === "transform" ? 1 + Math.sin(progress * Math.PI) * 0.18 : 1}) rotate(${Math.sin(progress * Math.PI) * -8}deg)`,
          }}
        >
          {action.operation === "transform" ? "{ }" : "→"}
        </div>
      )}
      {!moving && !single && (
        <div
          style={{
            position: "absolute",
            left: 608,
            top: 354,
            fontSize: 38,
            color: accent,
            opacity: 0.8,
          }}
        >
          {action.operation === "compare" ? "↔" : "→"}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 86,
          right: 86,
          top: 548,
          display: "flex",
          gap: 8,
        }}
      >
        {actions.map((item, i) => (
          <div
            key={`${item.subjectId}-${i}`}
            style={{
              height: 4,
              flex: 1,
              borderRadius: 4,
              background: `${accent}22`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: accent,
                width: `${i < index ? 100 : i === index ? progress * 100 : 0}%`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
