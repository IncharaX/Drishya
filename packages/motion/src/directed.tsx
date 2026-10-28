import type { ExplanationBeat } from "@drishya/contracts";
import { ThreeCanvas } from "@remotion/three";
// biome-ignore lint/correctness/noUnusedImports: Export bundler JSX runtime.
import React from "react";
import { interpolate, spring, useCurrentFrame } from "remotion";
import { Quaternion, Vector3 } from "three";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

import { MergeScene } from "./merge";
import { semanticAsset as semantic } from "./semantics";

const paths: Record<string, string> = {
  plant:
    "M28 53V22M28 34C3 37 3 13 27 23M28 25C50 29 54 6 29 15M28 44l-12 9m12-9 12 9",
  roots:
    "M28 3v21m0-7L15 8m13 15 14-10M28 24 12 38l-7 13m7-13 7 12M28 24l2 21-9 10m9-10 8 8M28 24l15 14 7 13m-7-13-6 8",
  soil: "M3 20h50M5 28l5 3m9-5 5 3m14-3 7 3M7 39l5 3m13-5 7 3m10-2 5 3M4 52h48",
  water:
    "M28 3C21 16 9 29 9 37a19 19 0 0 0 38 0C47 29 35 16 28 3Zm-9 33c-2 6 2 10 7 11",
  leaf: "M10 45C-1 12 30 3 51 5c-2 27-15 48-40 39M7 51 43 13M20 36l-2-14m11 5 12-1",
  sun: "M28 15a13 13 0 1 0 .1 0M28 2v6m0 40v6M2 28h6m40 0h6M9 9l5 5m28 28 5 5M9 47l5-5m28-28 5-5",
  air: "M4 18h32c16 0 14-18 2-14M4 28h43c11 0 10 14 0 14M4 38h20c14 0 12 15 1 15",
  food: "M9 14h38v34H9Zm0 0 19-10 19 10M28 4v35M9 14l19 12 19-12M28 26v22",
  label: "M6 7h44v42H6M14 19h28M14 28h28M14 37h18",

  person: "M28 23a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM10 49v-5c0-11 36-11 36 0v5Z",
  document: "M13 4h22l9 10v38H13Zm22 0v12h9M21 25h16M21 33h16M21 41h10",
  check: "M9 28l13 13 27-28",
  question: "M19 18c0-13 22-13 22 0 0 10-13 7-13 19m0 8v2",
  coins:
    "M9 17c0-9 38-9 38 0s-38 9-38 0Zm0 0v21c0 10 38 10 38 0V17M9 28c0 10 38 10 38 0",
  server: "M8 7h40v14H8Zm0 28h40v14H8ZM15 14h1m-1 28h1M28 21v14",
  package:
    "m28 4 22 12v25L28 53 6 41V16Zm0 25 22-13M28 29 6 16m22 13v24M17 10l22 13",
  planet: "M28 9a19 19 0 1 0 .1 0M5 40C-5 21 54 8 54 20S5 50 5 40",
  atom: "M28 24h.1M6 28c0-15 44-15 44 0S6 43 6 28Zm11-19c13-8 35 30 22 38S4 17 17 9Zm22 0C26 1 4 39 17 47S52 17 39 9",
  idea: "M18 37C-2 12 18 1 28 3s31 10 10 34M19 38h18v10H19Zm4 16h10",
  gear: "M28 11v-7m0 48v-7M11 28H4m48 0h-7M16 16l-5-5m34 34-5-5M16 40l-5 5m34-34-5 5M28 15a13 13 0 1 0 .1 0",
};
function Rod({
  from,
  to,
  color,
  radius = 0.07,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  radius?: number;
}) {
  const start = new Vector3(...from),
    end = new Vector3(...to),
    direction = end.clone().sub(start),
    mid = start.clone().add(end).multiplyScalar(0.5),
    rotation = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
  return (
    <mesh position={mid} quaternion={rotation}>
      <cylinderGeometry args={[radius, radius, direction.length(), 16]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.25} />
    </mesh>
  );
}
function ObjectMesh({ kind, color }: { kind: string; color: string }) {
  if (kind === "plant" || kind === "leaf")
    return (
      <group>
        <Rod
          from={[0, -0.65, 0]}
          to={[0, 0.65, 0]}
          color="#418854"
          radius={0.055}
        />
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.3, side * 0.25, 0]}
            rotation={[0, 0, side * -0.8]}
            scale={[0.5, 0.22, 0.08]}
          >
            <sphereGeometry args={[1, 32, 16]} />
            <meshStandardMaterial color="#56aa67" roughness={0.65} />
          </mesh>
        ))}
        {kind === "plant" && (
          <Rod
            from={[-0.3, -0.8, 0]}
            to={[0, -0.6, 0]}
            color="#987353"
            radius={0.04}
          />
        )}
      </group>
    );
  if (kind === "roots")
    return (
      <group>
        {[-1, 0, 1].map((side) => (
          <React.Fragment key={side}>
            <Rod
              from={[0, 0.6, 0]}
              to={[side * 0.5, -0.3, 0]}
              color="#a27c52"
              radius={0.06}
            />
            <Rod
              from={[side * 0.5, -0.3, 0]}
              to={[side * 0.6, -0.75, 0]}
              color="#a27c52"
              radius={0.035}
            />
          </React.Fragment>
        ))}
      </group>
    );
  if (kind === "soil")
    return (
      <group>
        <mesh>
          <boxGeometry args={[1.5, 0.6, 0.65]} />
          <meshStandardMaterial color="#8b6444" roughness={1} />
        </mesh>
        {[-0.4, 0, 0.4].map((x) => (
          <mesh key={x} position={[x, 0.32, 0.08]}>
            <sphereGeometry args={[0.06, 12, 8]} />
            <meshStandardMaterial color="#ba946b" />
          </mesh>
        ))}
      </group>
    );
  if (kind === "sun")
    return (
      <mesh>
        <sphereGeometry args={[0.65, 40, 24]} />
        <meshStandardMaterial
          color="#ffbf36"
          emissive="#e89118"
          emissiveIntensity={0.65}
        />
      </mesh>
    );
  if (kind === "water")
    return (
      <group>
        <mesh scale={[0.6, 0.8, 0.6]}>
          <sphereGeometry args={[0.7, 32, 24]} />
          <meshStandardMaterial color="#419fdb" roughness={0.15} />
        </mesh>
        <mesh position={[0, 0.6, 0]}>
          <coneGeometry args={[0.35, 0.7, 24]} />
          <meshStandardMaterial color="#419fdb" roughness={0.15} />
        </mesh>
      </group>
    );
  if (kind === "label") return null;
  if (kind === "air")
    return (
      <group>
        {[-0.55, 0, 0.55].map((x, index) => (
          <mesh key={x} position={[x, 0, 0]}>
            <sphereGeometry args={[index === 1 ? 0.22 : 0.3, 32, 20]} />
            <meshStandardMaterial color={index === 1 ? "#526474" : "#e96d6d"} />
          </mesh>
        ))}
        <Rod
          from={[-0.55, 0, 0]}
          to={[0.55, 0, 0]}
          color="#899fa6"
          radius={0.04}
        />
      </group>
    );
  if (kind === "food")
    return (
      <mesh>
        <boxGeometry args={[1.15, 0.8, 0.25]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    );
  const material = (
    <meshStandardMaterial color={color} roughness={0.24} metalness={0.18} />
  );
  if (kind === "person")
    return (
      <group>
        <mesh position={[0, 0.35, 0]}>
          <sphereGeometry args={[0.28, 32, 24]} />
          {material}
        </mesh>
        <mesh position={[0, -0.3, 0]}>
          <capsuleGeometry args={[0.3, 0.4, 8, 20]} />
          {material}
        </mesh>
        <Rod
          from={[-0.65, -0.35, 0]}
          to={[0.65, -0.35, 0]}
          color={color}
          radius={0.12}
        />
      </group>
    );
  if (kind === "coins")
    return (
      <group rotation={[0.18, 0, -0.12]}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[(i - 1) * 0.1, (i - 1) * 0.25, 0]}
            rotation={[0, i * 0.4, 0]}
          >
            <cylinderGeometry args={[0.58, 0.58, 0.17, 48]} />
            {material}
          </mesh>
        ))}
        <mesh position={[0, 0.47, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.31, 0.025, 12, 40]} />
          <meshStandardMaterial color="#fff1c9" />
        </mesh>
      </group>
    );
  if (kind === "check")
    return (
      <group>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[0.7, 0.035, 12, 48]} />
          {material}
        </mesh>
        <Rod from={[-0.42, 0, 0.12]} to={[-0.12, -0.3, 0.12]} color={color} />
        <Rod from={[-0.12, -0.3, 0.12]} to={[0.48, 0.4, 0.12]} color={color} />
      </group>
    );
  if (kind === "planet" || kind === "atom")
    return (
      <group>
        <mesh>
          <sphereGeometry args={[kind === "atom" ? 0.27 : 0.55, 40, 28]} />
          {material}
        </mesh>
        {[0, 1, 2].slice(0, kind === "atom" ? 3 : 1).map((i) => (
          <mesh key={i} rotation={[0.9 + i * 0.8, 0.4 + i, 0]}>
            <torusGeometry args={[0.8, 0.035, 12, 64]} />
            {material}
          </mesh>
        ))}
      </group>
    );
  if (kind === "document" || kind === "server")
    return (
      <group>
        <mesh>
          <boxGeometry args={[1, 1.3, 0.24]} />
          {material}
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[-0.03, 0.35 - i * 0.3, 0.14]}>
            <boxGeometry args={[i === 2 ? 0.38 : 0.65, 0.055, 0.025]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
        ))}
      </group>
    );
  if (kind === "package")
    return (
      <group rotation={[0.2, 0.55, 0]}>
        <mesh>
          <boxGeometry args={[1.05, 1.05, 1.05]} />
          {material}
        </mesh>
        <mesh position={[0, 0, 0.54]}>
          <boxGeometry args={[0.15, 1.05, 0.025]} />
          <meshStandardMaterial color="#fff0ce" />
        </mesh>
      </group>
    );
  if (kind === "question")
    return (
      <group>
        <mesh position={[0, 0.25, 0]} rotation={[0, 0, -0.7]}>
          <torusGeometry args={[0.4, 0.07, 16, 48, 4.5]} />
          {material}
        </mesh>
        <Rod from={[0.12, -0.08, 0]} to={[0, -0.3, 0]} color={color} />
        <mesh position={[0, -0.6, 0]}>
          <sphereGeometry args={[0.08, 20, 16]} />
          {material}
        </mesh>
      </group>
    );
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <sphereGeometry args={[0.51, 40, 28]} />
        <meshStandardMaterial color={color} roughness={0.22} metalness={0.1} />
      </mesh>
      <mesh position={[0, -0.43, 0]}>
        <cylinderGeometry args={[0.25, 0.2, 0.3, 32]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.65, 0]}>
        <cylinderGeometry args={[0.15, 0.1, 0.1, 32]} />
        {material}
      </mesh>
    </group>
  );
}
export function DirectedScene({
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
    duration = beat.durationInFrames ?? 210,
    nodes = beat.visual.nodes;
  const count = nodes.length,
    columns = count <= 3 ? count : Math.ceil(count / 2);
  const focused = nodes.findIndex(
    (node) =>
      beat.visual.focus &&
      `${node.id} ${node.label}`
        .toLowerCase()
        .includes(beat.visual.focus.toLowerCase()),
  );
  const active =
    focused >= 0
      ? focused
      : Math.min(
          count - 1,
          Math.floor(
            Math.max(0, (frame - 12) / Math.max(1, duration - 28)) * count,
          ),
        );
  const positions = nodes.map((node, index) => ({
    ...node,
    x:
      640 +
      ((index % columns) -
        (Math.min(columns, count - Math.floor(index / columns) * columns) - 1) /
          2) *
        (count <= 2 ? 480 : 360),
    y: count <= 3 ? 345 : Math.floor(index / columns) * 215 + 265,
  }));
  const dimensional =
    beat.visual.dimension === "3d" || beat.visual.kind === "spatial";
  const rawConnections = beat.visual.links.length
    ? beat.visual.links
    : beat.visual.kind === "process" || beat.visual.kind === "cause"
      ? nodes
          .slice(0, -1)
          .map((node, i) => ({ from: node.id, to: nodes[i + 1].id, label: "" }))
      : [];
  // One route per directed relationship. Model repetition must never paint
  // ten copies of a line or its label on top of the explanatory objects.
  const connections = rawConnections.filter(
    (link, index, all) =>
      index ===
      all.findIndex(
        (other) => other.from === link.from && other.to === link.to,
      ),
  );
  const mergeTarget = nodes.find(
    (node) =>
      connections.filter((edge) => edge.to === node.id).length ===
      nodes.length - 1,
  );
  if (mergeTarget && count >= 3 && count <= 6 && !dimensional) {
    const resolved = {
      ...beat,
      visual: {
        ...beat.visual,
        nodes: nodes.map((node) => ({
          ...node,
          icon: semantic(node) as typeof node.icon,
        })),
      },
    };
    return (
      <MergeScene
        beat={resolved}
        targetId={mergeTarget.id}
        accent={accent}
        ink={ink}
        dark={dark}
        paths={paths}
      />
    );
  }
  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: font }}>
      <svg
        aria-hidden="true"
        width={1280}
        height={720}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <marker
            id={`arrow-${beat.id}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={accent} />
          </marker>
        </defs>
        {connections.map((link, index) => {
          const from = positions.find((node) => node.id === link.from),
            to = positions.find((node) => node.id === link.to);
          if (!from || !to) return null;
          const dx = to.x - from.x,
            dy = to.y - from.y,
            length = Math.hypot(dx, dy),
            ux = dx / length,
            uy = dy / length;
          // Anchor in the actual direction of travel, outside each object.
          const clearance = count <= 3 ? 118 : 120;
          const sx = Math.abs(dx) < 1 ? from.x + 145 : from.x + ux * clearance,
            sy =
              Math.abs(dx) < 1 ? from.y : from.y + uy * Math.min(clearance, 45),
            tx = Math.abs(dx) < 1 ? to.x + 145 : to.x - ux * clearance,
            ty = Math.abs(dx) < 1 ? to.y : to.y - uy * Math.min(clearance, 45);
          const reciprocal = connections.some(
            (edge) => edge.from === link.to && edge.to === link.from,
          );
          const bend = reciprocal ? 44 : Math.abs(dy) > 0 ? 30 : 0;
          const cx = Math.abs(dx) < 1 ? sx + 85 : (sx + tx) / 2 - uy * bend,
            cy = (sy + ty) / 2 + ux * bend;
          const curve = `M${sx} ${sy} Q${cx} ${cy} ${tx} ${ty}`;
          const reveal = interpolate(
              frame,
              [index * 8 + 8, index * 8 + 35],
              [0, 1],
              clamp,
            ),
            travel =
              ((frame / 90) * beat.visual.motion - index * 0.18 + 10) % 1;
          return (
            <g key={`${link.from}-${link.to}`}>
              <path
                d={curve}
                fill="none"
                stroke={ink}
                strokeOpacity={0.12}
                strokeWidth={1.5}
              />
              <path
                d={curve}
                fill="none"
                stroke={accent}
                strokeWidth={2}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - reveal}
                markerEnd={`url(#arrow-${beat.id})`}
              />
              <circle
                r={4}
                fill={accent}
                cx={
                  (1 - travel) ** 2 * sx +
                  2 * (1 - travel) * travel * cx +
                  travel ** 2 * tx
                }
                cy={
                  (1 - travel) ** 2 * sy +
                  2 * (1 - travel) * travel * cy +
                  travel ** 2 * ty
                }
                opacity={reveal}
              />
              {link.label && (
                <text
                  x={(sx + 2 * cx + tx) / 4}
                  y={(sy + 2 * cy + ty) / 4 - 20}
                  textAnchor="middle"
                  fill={ink}
                  opacity={0.65}
                  style={{ fontSize: 15, fontFamily: font }}
                >
                  {link.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {dimensional && (
        <ThreeCanvas
          width={1280}
          height={720}
          style={{ position: "absolute", inset: 0 }}
          orthographic
          camera={{ position: [0, 0, 12], zoom: 72 }}
          gl={{ alpha: true, antialias: true }}
        >
          <ambientLight intensity={1.5} />
          <directionalLight position={[-4, 6, 8]} intensity={3.5} />
          <pointLight position={[5, -2, 6]} color={accent} intensity={30} />
          {positions.map((node, index) => {
            const enter = spring({
              frame: frame - index * 7,
              fps: 30,
              config: { damping: 18, stiffness: 100 },
            });
            return (
              <group
                key={node.id}
                position={[(node.x - 640) / 72, (360 - node.y) / 72, 0.1]}
                rotation={[
                  Math.sin(frame / 100 + index) * 0.12,
                  Math.sin(frame / 130 + index) * 0.25,
                  0,
                ]}
                scale={
                  Math.max(0.001, enter) *
                  beat.visual.objectScale *
                  (index === active ? 1.12 : 0.92) *
                  (count <= 3 ? 1.28 : 0.8)
                }
              >
                {beat.visual.kind === "chart" ? (
                  <mesh
                    position={[
                      0,
                      Math.max(
                        0.05,
                        (Math.abs(node.value ?? 0) /
                          Math.max(
                            1,
                            ...nodes.map((item) => Math.abs(item.value ?? 0)),
                          )) *
                          1.7,
                      ) /
                        2 -
                        0.5,
                      0,
                    ]}
                  >
                    <boxGeometry
                      args={[
                        0.65,
                        Math.max(
                          0.05,
                          (Math.abs(node.value ?? 0) /
                            Math.max(
                              1,
                              ...nodes.map((item) => Math.abs(item.value ?? 0)),
                            )) *
                            1.7,
                        ),
                        0.5,
                      ]}
                    />
                    <meshStandardMaterial
                      color={node.color ?? accent}
                      roughness={0.3}
                      metalness={0.15}
                    />
                  </mesh>
                ) : (
                  <ObjectMesh
                    kind={semantic(node)}
                    color={
                      node.color ??
                      (index === active ? accent : dark ? "#96aac5" : "#87959f")
                    }
                  />
                )}
              </group>
            );
          })}
        </ThreeCanvas>
      )}
      {positions.map((node, index) => {
        const enter = spring({
            frame: frame - index * 7,
            fps: 30,
            config: { damping: 22 },
          }),
          selected = index === active;
        return (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: node.x - 125,
              top: node.y - (count <= 3 ? 76 : 43),
              width: 250,
              textAlign: "center",
              opacity: enter,
              transform: `translateY(${(1 - enter) * 12}px)`,
            }}
          >
            <div
              style={{
                height: count <= 3 ? 152 : 86,
                display: "grid",
                placeItems: "center",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  width: 122,
                  height: 122,
                  borderRadius: "50%",
                  background: `radial-gradient(circle,${accent}${selected ? "19" : "08"},transparent 70%)`,
                  transform: `scale(${1 + Math.sin(frame / 40) * 0.04})`,
                }}
              />
              {!dimensional && (
                <svg
                  aria-hidden="true"
                  width={count <= 3 ? 94 : 58}
                  height={count <= 3 ? 94 : 58}
                  viewBox="0 0 56 56"
                  fill="none"
                  stroke={selected ? accent : ink}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    opacity: selected ? 1 : 0.5,
                    transform: `scale(${selected ? 1.06 : 0.88}) rotate(${Math.sin(frame / 90 + index) * 2}deg)`,
                  }}
                >
                  <path d={paths[semantic(node)] ?? paths.idea} />
                </svg>
              )}
            </div>
            <div
              style={{
                width: 22,
                height: 2,
                margin: count <= 3 ? "8px auto 13px" : "4px auto 7px",
                background: selected ? accent : ink,
                opacity: selected ? 1 : 0.15,
              }}
            />
            <div
              style={{
                fontSize: count <= 3 ? 24 : 19,
                fontWeight: selected ? 650 : 450,
                color: ink,
                lineHeight: 1.2,
                letterSpacing: -0.5,
              }}
            >
              {node.label}
              {beat.visual.kind === "chart" && (
                <span style={{ display: "block", marginTop: 5, fontSize: 27 }}>
                  {node.value}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: count <= 3 ? 16 : 13,
                lineHeight: 1.45,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                color: ink,
                opacity: selected ? 0.72 : 0.4,
                margin: "9px auto 0",
                maxWidth: 210,
              }}
            >
              {node.detail}
            </div>
          </div>
        );
      })}
    </div>
  );
}
