"use client";

import {
  timelinePosition,
  type Timeline,
  type LocalizedStoryboard,
  type Scene,
} from "@drishya/contracts";
import React, { useId } from "react";

function wrap(text: string, length: number, max = 3): string[] {
  const lines: string[] = [];
  const parts = (value: string) =>
    Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      (item) => item.segment,
    );
  for (const word of text.split(/\s+/u)) {
    const last = lines.length - 1;
    if (
      last < 0 ||
      parts(lines[last] ?? "").length + parts(word).length + 1 > length
    )
      lines.push(word);
    else lines[last] += ` ${word}`;
  }
  // Clip any unusually long token visually; the editor retains the full text.
  return lines.slice(0, max).map((line, i) =>
    parts(line).length > length
      ? `${parts(line)
          .slice(0, length - 1)
          .join("")}…`
      : i === max - 1 && lines.length > max
        ? `${parts(line)
            .slice(0, length - 1)
            .join("")}…`
        : line,
  );
}
function TextBlock({
  text,
  x,
  y,
  width = 55,
  size = 28,
  anchor = "start",
  max = 3,
  font = "Inter, Noto Sans Devanagari, Noto Sans Kannada, Noto Sans Telugu, sans-serif",
}: {
  text: string;
  x: number;
  y: number;
  width?: number;
  size?: number;
  anchor?: "start" | "middle";
  max?: number;
  font?: string;
}) {
  return (
    <text
      x={x}
      y={y}
      fill="#1a1a1a"
      fontSize={size}
      textAnchor={anchor}
      fontFamily={font}
    >
      {wrap(text, width, max).map((line, i) => (
        <tspan key={`${i}-${line}`} x={x} dy={i ? size * 1.35 : 0}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

// Scene data is always rendered as escaped SVG text. No generated markup/code runs.
// A normalized progress value is the shared boundary for later audio-driven timing.
export function SceneCanvas({
  scene,
  progress = 1,
  locale = "en",
}: {
  scene: Scene;
  progress?: number;
  locale?: "en" | "hi" | "kn" | "te" | "mr";
}) {
  const id = useId().replace(/:/gu, "");
  const t = Math.max(0, Math.min(1, progress));
  const positions =
    scene.type === "diagram"
      ? scene.nodes.map((node, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / scene.nodes.length;
          return {
            ...node,
            x:
              scene.layout === "flow"
                ? 150 + (i * 980) / (scene.nodes.length - 1)
                : 640 + Math.cos(angle) * 380,
            y: scene.layout === "flow" ? 380 : 395 + Math.sin(angle) * 155,
          };
        })
      : [];
  return (
    <svg
      viewBox="0 0 1280 720"
      lang={locale}
      direction="ltr"
      width="1280"
      height="720"
      role="img"
      aria-labelledby={`title-${id}`}
      style={{
        display: "block",
        width: "100%",
        height: "auto",
        background: "#fffdf8",
        border: "1.5px solid #1a1a1a",
      }}
    >
      <title id={`title-${id}`}>{scene.title}</title>
      <defs>
        <marker
          id={`arrow-${id}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#1a1a1a" />
        </marker>
        <clipPath id={`clip-${id}`}>
          <rect x="30" y="24" width="1220" height="672" />
        </clipPath>
      </defs>
      <rect width="1280" height="720" fill="#fffdf8" />
      <rect
        x="0"
        y="0"
        width="1280"
        height="12"
        fill={
          scene.type === "title"
            ? "#f07289"
            : scene.type === "diagram"
              ? "#7ad97a"
              : "#a49ad8"
        }
      />
      <g clipPath={`url(#clip-${id})`}>
        <TextBlock
          text={scene.title}
          x={64}
          y={85}
          width={48}
          size={48}
          max={2}
          font={
            locale === "en"
              ? "Instrument Serif, Georgia, serif"
              : locale === "kn"
                ? "Noto Sans Kannada, sans-serif"
                : locale === "te"
                  ? "Noto Sans Telugu, sans-serif"
                  : "Noto Sans Devanagari, sans-serif"
          }
        />
        {scene.type === "title" && (
          <g>
            <TextBlock
              text={scene.subtitle}
              x={64}
              y={245}
              width={65}
              size={30}
              max={3}
            />
            {scene.bullets.map((bullet, i) => (
              <g
                key={`${i}-${bullet}`}
                opacity={t >= i / Math.max(scene.bullets.length, 1) ? 1 : 0.15}
              >
                <rect
                  x="66"
                  y={405 + i * 86}
                  width="14"
                  height="14"
                  fill={i % 2 ? "#7ad97a" : "#f07289"}
                />
                <TextBlock
                  text={bullet}
                  x={103}
                  y={420 + i * 86}
                  width={78}
                  size={24}
                  max={2}
                />
              </g>
            ))}
          </g>
        )}
        {scene.type === "diagram" && (
          <g>
            {scene.edges.map((edge, i) => {
              const a = positions.find((node) => node.id === edge.from);
              const b = positions.find((node) => node.id === edge.to);
              if (!a || !b) return null;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const scale = Math.max(Math.abs(dx) / 92, Math.abs(dy) / 50, 1);
              const sx = a.x + dx / scale;
              const sy = a.y + dy / scale;
              const ex = b.x - dx / scale;
              const ey = b.y - dy / scale;
              const mx = (a.x + b.x) / 2;
              const my =
                (a.y + b.y) / 2 -
                (scene.layout === "flow" ? 88 + (i % 2) * 25 : 28);
              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <path
                    d={
                      scene.layout === "flow" && Math.abs(dx) > 300
                        ? `M ${sx} ${sy} Q ${mx} ${sy - 140} ${ex} ${ey}`
                        : `M ${sx} ${sy} L ${ex} ${ey}`
                    }
                    stroke="#1a1a1a"
                    strokeWidth="2.5"
                    fill="none"
                    markerEnd={`url(#arrow-${id})`}
                  />
                  <rect
                    x={mx - 82}
                    y={my - 21}
                    width="164"
                    height="50"
                    fill="#f4f1ea"
                  />
                  <TextBlock
                    text={edge.label}
                    x={mx}
                    y={my}
                    width={16}
                    size={17}
                    max={2}
                    anchor="middle"
                  />
                </g>
              );
            })}
            {positions.map((node, i) => (
              <g key={node.id} opacity={t >= i / positions.length ? 1 : 0.15}>
                <rect
                  x={node.x - 90 + 5}
                  y={node.y - 50 + 5}
                  width="180"
                  height="100"
                  fill="#1a1a1a"
                />
                <rect
                  x={node.x - 90}
                  y={node.y - 50}
                  width="180"
                  height="100"
                  fill={i % 2 ? "#e6f5e3" : "#fdeaed"}
                  stroke="#1a1a1a"
                  strokeWidth="2"
                />
                <TextBlock
                  text={node.label}
                  x={node.x}
                  y={node.y - 16}
                  width={17}
                  size={21}
                  anchor="middle"
                  max={3}
                />
              </g>
            ))}
            <TextBlock
              text={scene.caption}
              x={64}
              y={650}
              width={100}
              size={23}
              max={2}
            />
          </g>
        )}
        {scene.type === "code" && (
          <g>
            <rect
              x="64"
              y="160"
              width="1152"
              height="435"
              fill="#f4f1ea"
              stroke="#1a1a1a"
              strokeWidth="2"
            />
            <text
              x="88"
              y="190"
              fontSize="16"
              fontFamily="IBM Plex Mono, monospace"
              fill="#5c5751"
            >
              {scene.language} · illustrative code
            </text>
            {scene.code
              .split("\n")
              .slice(0, 14)
              .map((line, i) => (
                <g key={`${i}-${line}`}>
                  <rect
                    x="76"
                    y={207 + i * 26}
                    width="1128"
                    height="26"
                    fill={
                      scene.focusLines.includes(i + 1) &&
                      t >=
                        scene.focusLines.indexOf(i + 1) /
                          scene.focusLines.length
                        ? "#fdf4d8"
                        : "transparent"
                    }
                  />
                  <text
                    x="90"
                    y={226 + i * 26}
                    fontSize="18"
                    fontFamily="IBM Plex Mono, monospace"
                    fill="#5c5751"
                  >
                    {i + 1}
                  </text>
                  <text
                    x="134"
                    y={226 + i * 26}
                    fontSize="18"
                    fontFamily="IBM Plex Mono, monospace"
                    fill="#1a1a1a"
                    xmlSpace="preserve"
                  >
                    {line}
                  </text>
                </g>
              ))}
            <TextBlock
              text={scene.caption}
              x={64}
              y={650}
              width={100}
              size={23}
              max={2}
            />
          </g>
        )}
      </g>
    </svg>
  );
}

// Both the audio-driven browser player and the export browser use this exact frame.
export function VideoFrame({
  content,
  timeline,
  time,
  locale,
}: {
  content: LocalizedStoryboard;
  timeline: Timeline;
  time: number;
  locale: "en" | "hi" | "kn" | "te" | "mr";
}) {
  const position = timelinePosition(timeline, time);
  const scene = content.scenes[position.index];
  if (!scene) return null;
  return (
    <div
      style={{
        width: 1280,
        height: 720,
        position: "relative",
        background: "#fffdf8",
        overflow: "hidden",
        color: "#1a1a1a",
      }}
      lang={locale}
    >
      <div
        style={{
          width: 1120,
          height: 630,
          margin: "0 auto",
          opacity: Math.min(
            1,
            Math.max(0, (time - position.scene.start) / 0.25),
            Math.max(0, (position.scene.end - time) / 0.25),
          ),
        }}
      >
        <SceneCanvas
          scene={scene}
          progress={position.progress}
          locale={locale}
        />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: 84,
          padding: "8px 48px",
          boxSizing: "border-box",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          background: "#1a1a1a",
          color: "#fffdf8",
          fontSize: 25,
          lineHeight: 1.35,
          fontFamily:
            "Inter, Noto Sans Devanagari, Noto Sans Kannada, Noto Sans Telugu, sans-serif",
        }}
        aria-live="off"
      >
        {position.caption}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 632,
          height: 3,
          width: `${Math.min(1, Math.max(0, time / timeline.duration)) * 100}%`,
          background: "#f07289",
        }}
      />
    </div>
  );
}
