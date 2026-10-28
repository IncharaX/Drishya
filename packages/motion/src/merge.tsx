import type { ExplanationBeat } from "@drishya/contracts";
// biome-ignore lint/correctness/noUnusedImports: Remotion export JSX runtime.
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

/** Converging inputs use separate lanes, never a grid of crossing arrows. */
export function MergeScene({
  beat,
  targetId,
  accent,
  ink,
  dark,
  paths,
}: {
  beat: ExplanationBeat;
  targetId: string;
  accent: string;
  ink: string;
  dark: boolean;
  paths: Record<string, string>;
}) {
  const frame = useCurrentFrame(),
    target = beat.visual.nodes.find((node) => node.id === targetId);
  const inputs = beat.visual.nodes.filter((node) => node.id !== targetId);
  if (!target) return null;
  const compact = inputs.length > 3,
    height = compact ? 72 : 94,
    top = compact ? 205 : 245,
    spacing = compact ? 76 : 115;
  const actor = (node: typeof target, x: number, y: number) => (
    <div
      key={node.id}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 290,
        height,
        padding: compact ? 10 : 16,
        boxSizing: "border-box",
        display: "flex",
        gap: 16,
        alignItems: "center",
        borderRadius: 16,
        border: `1px solid ${accent}35`,
        background: dark ? "#182940" : "#ffffff",
        boxShadow: "0 8px 24px #12243a0a",
      }}
    >
      <svg
        aria-hidden
        width={compact ? 38 : 52}
        height={compact ? 38 : 52}
        viewBox="0 0 56 56"
        fill="none"
        stroke={accent}
        strokeWidth={2}
        style={{ flexShrink: 0 }}
      >
        <path d={paths[node.icon] ?? paths.label} />
      </svg>
      <div
        style={{
          color: ink,
          fontSize: compact ? 16 : 20,
          fontWeight: 600,
          lineHeight: 1.15,
        }}
      >
        {node.label}
        <div
          style={{
            fontSize: compact ? 11 : 13,
            display: "-webkit-box",
            WebkitLineClamp: compact ? 1 : 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.4,
            opacity: 0.65,
            fontWeight: 400,
            marginTop: 6,
          }}
        >
          {node.detail}
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg
        aria-hidden
        width={1280}
        height={720}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <marker
            id={`merge-${beat.id}`}
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path d="M0 0 10 5 0 10Z" fill={accent} />
          </marker>
        </defs>
        {inputs.map((node, i) => {
          const y = top + i * spacing,
            edge = beat.visual.links.find(
              (link) => link.from === node.id && link.to === targetId,
            ),
            reveal = interpolate(frame, [i * 16, i * 16 + 30], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
          const d = `M450 ${y + height / 2} H${620 + i * 30} V${360} H830`;
          return (
            <g key={node.id} opacity={reveal}>
              <path
                d={d}
                stroke={accent}
                strokeWidth={2}
                fill="none"
                markerEnd={`url(#merge-${beat.id})`}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - reveal}
              />
              <text x={485} y={y + height / 2 - 15} fontSize={13} fill={ink}>
                {edge?.label}
              </text>
              <circle
                cx={460 + (((frame + i * 20) % 90) / 90) * 140}
                cy={y + height / 2}
                r={4}
                fill={accent}
              />
            </g>
          );
        })}
      </svg>
      {inputs.map((node, i) => actor(node, 160, top + i * spacing))}
      {actor(target, 835, 360 - height / 2)}
    </div>
  );
}
