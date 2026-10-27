import type { ExplanationBeat } from "@drishya/contracts";
import { ThreeCanvas } from "@remotion/three";
// biome-ignore lint/correctness/noUnusedImports: Required by the export bundler JSX transformation.
import React from "react";
import { useCurrentFrame } from "remotion";

const planets = [
  { name: "Mercury", color: "#bcb0a0", radius: 0.12, orbit: 1.45 },
  { name: "Venus", color: "#e9ba7b", radius: 0.2, orbit: 2.05 },
  { name: "Earth", color: "#388aff", radius: 0.24, orbit: 2.8 },
  { name: "Mars", color: "#dc6c46", radius: 0.18, orbit: 3.55 },
  { name: "Jupiter", color: "#d9b591", radius: 0.43, orbit: 4.45 },
  { name: "Saturn", color: "#e9d5a2", radius: 0.35, orbit: 5.55 },
  { name: "Uranus", color: "#7edce7", radius: 0.27, orbit: 6.4 },
  { name: "Neptune", color: "#4776ed", radius: 0.26, orbit: 7.25 },
];
function SolarObjects({ beat }: { beat: ExplanationBeat }) {
  const frame = useCurrentFrame();
  const t = (frame / 30) * beat.visual.motion;
  return (
    <group rotation={[0.08, -0.2 + t * 0.035, 0.02]} position={[0, -0.15, 0]}>
      <ambientLight intensity={1.05} />
      <pointLight position={[0, 1, 0]} intensity={85} decay={1.8} />
      <directionalLight position={[4, 7, 6]} intensity={1.8} />
      <mesh
        rotation={[0, t * 0.15, 0]}
        scale={
          !beat.visual.focus || beat.visual.focus.toLowerCase().includes("sun")
            ? beat.visual.objectScale
            : 1
        }
      >
        <sphereGeometry args={[0.68, 48, 32]} />
        <meshBasicMaterial color="#ffbd55" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.77, 40, 24]} />
        <meshBasicMaterial color="#ff9c30" transparent opacity={0.12} />
      </mesh>
      {planets.map((planet, index) => {
        const angle = t * (0.8 / (1 + index * 0.35)) + index * 1.13;
        const x = Math.cos(angle) * planet.orbit,
          z = Math.sin(angle) * planet.orbit;
        return (
          <group key={planet.name}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry
                args={[planet.orbit - 0.008, planet.orbit + 0.008, 128]}
              />
              <meshBasicMaterial
                color="#a0b3db"
                transparent
                opacity={0.18}
                side={2}
              />
            </mesh>
            <group
              position={[x, 0, z]}
              rotation={[0.15, t * 0.4, 0]}
              scale={
                beat.visual.focus
                  .toLowerCase()
                  .includes(planet.name.toLowerCase())
                  ? 1.35 * beat.visual.objectScale
                  : 1
              }
            >
              <mesh>
                <sphereGeometry args={[planet.radius, 40, 24]} />
                <meshStandardMaterial color={planet.color} roughness={0.72} />
              </mesh>
              {planet.name === "Earth" && (
                <>
                  <mesh rotation={[0.3, 0.2, 0.4]}>
                    <sphereGeometry
                      args={[planet.radius * 1.007, 24, 16, 0.2, 1.1, 0.5, 0.9]}
                    />
                    <meshStandardMaterial color="#65c88b" roughness={1} />
                  </mesh>
                  <mesh rotation={[-0.8, 2.2, 0.5]}>
                    <sphereGeometry
                      args={[planet.radius * 1.008, 24, 16, 0.5, 0.8, 0.4, 1.1]}
                    />
                    <meshStandardMaterial color="#65c88b" />
                  </mesh>
                </>
              )}
              {planet.name === "Saturn" && (
                <mesh rotation={[1.12, 0, 0.2]}>
                  <ringGeometry
                    args={[planet.radius * 1.4, planet.radius * 2.05, 64]}
                  />
                  <meshStandardMaterial
                    color="#d7ba83"
                    side={2}
                    transparent
                    opacity={0.78}
                  />
                </mesh>
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}
function SpatialObjects({ beat }: { beat: ExplanationBeat }) {
  const frame = useCurrentFrame(),
    t = (frame / 30) * beat.visual.motion;
  const nodes = beat.visual.nodes;
  return (
    <group rotation={[0.15, Math.sin(t * 0.2) * 0.16, 0]}>
      <ambientLight intensity={1.3} />
      <directionalLight position={[4, 6, 8]} intensity={3} />
      <pointLight position={[-3, 0, 3]} intensity={15} color="#75aaff" />
      {nodes.map((node, i) => {
        const x = (i - (nodes.length - 1) / 2) * 2.1;
        const y = Math.sin(t * 1.1 + i) * 0.22;
        return (
          <group
            key={node.id}
            position={[x, y, 0]}
            scale={beat.visual.objectScale}
          >
            <mesh rotation={[t * 0.16, t * 0.32 + i * 0.5, 0.1]}>
              {node.shape === "cube" ? (
                <boxGeometry args={[1.25, 1.25, 1.25]} />
              ) : node.shape === "cylinder" ? (
                <cylinderGeometry args={[0.55, 0.55, 1.6, 40]} />
              ) : (
                <sphereGeometry args={[0.75, 48, 32]} />
              )}
              <meshStandardMaterial
                color={
                  node.color ??
                  ["#739dff", "#cba3ff", "#6fe0c2", "#ffbd7b"][i % 4]
                }
                metalness={0.25}
                roughness={0.28}
              />
            </mesh>
            <mesh position={[0, -1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[1, 48]} />
              <meshBasicMaterial color="#000000" transparent opacity={0.1} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
export function SpaceScene({ beat }: { beat: ExplanationBeat }) {
  const solar = beat.visual.kind === "solar";
  return (
    <ThreeCanvas
      width={1280}
      height={720}
      style={{ position: "absolute", inset: 0 }}
      camera={{
        position: solar ? [0, 8.8, 11.7] : [0, 2.5, 11],
        fov: solar ? 57 : 42,
      }}
      gl={{ antialias: true, alpha: true }}
    >
      {solar ? <SolarObjects beat={beat} /> : <SpatialObjects beat={beat} />}
    </ThreeCanvas>
  );
}
