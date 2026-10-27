"use client";
import type { Storyboard } from "@drishya/contracts";
import { SceneCanvas } from "@drishya/renderer";
import { Button } from "@drishya/ui/components/button";
import Link from "next/link";
import { useState } from "react";

const example: Storyboard = {
  title: "The water cycle",
  learningObjective:
    "Identify evaporation, condensation and precipitation in the water cycle.",
  scenes: [
    {
      id: "start",
      type: "title",
      title: "Water keeps moving",
      narration:
        "Water moves between Earth's surface and the atmosphere. Three key processes are evaporation, condensation and precipitation.",
      subtitle: "A simple introduction to the water cycle.",
      bullets: ["Evaporation", "Condensation", "Precipitation"],
      sourceIds: [],
    },
    {
      id: "cycle",
      type: "diagram",
      title: "Follow a drop",
      narration:
        "Liquid water evaporates into water vapour. Cooling water vapour condenses into cloud droplets. Water returns to the surface as precipitation.",
      layout: "cycle",
      nodes: [
        { id: "surface", label: "Surface water" },
        { id: "vapour", label: "Water vapour" },
        { id: "cloud", label: "Cloud droplets" },
      ],
      edges: [
        { from: "surface", to: "vapour", label: "Evaporation" },
        { from: "vapour", to: "cloud", label: "Condensation" },
        { from: "cloud", to: "surface", label: "Precipitation" },
      ],
      caption: "This simplified model shows three key processes.",
      sourceIds: [],
    },
    {
      id: "recap",
      type: "title",
      title: "Name the change",
      narration:
        "Evaporation changes liquid water to vapour. Condensation changes vapour to liquid droplets. Precipitation carries water from clouds back to the surface.",
      subtitle: "Remember the three processes.",
      bullets: ["Liquid → vapour", "Vapour → droplets", "Clouds → surface"],
      sourceIds: [],
    },
  ],
};
export function BuiltInExample() {
  const [index, setIndex] = useState(0);
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <Link href="/workspace" className="text-sm underline">
        Back to studio
      </Link>
      <p className="field-label">Built-in example · authored demonstration</p>
      <h1 className="font-display text-5xl">The water cycle.</h1>
      <p className="border border-ink bg-yellow-soft p-4 text-sm">
        This is a built-in visual example. It was not generated from your topic
        and has no generated narration or exported video. It does not replace or
        mark any failed job as successful.
      </p>
      <SceneCanvas scene={example.scenes[index]} />
      <p className="text-sm leading-relaxed">
        {example.scenes[index].narration}
      </p>
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={!index}
          onClick={() => setIndex(index - 1)}
        >
          Previous scene
        </Button>
        <Button
          disabled={index === example.scenes.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          Next scene
        </Button>
      </div>
    </main>
  );
}
