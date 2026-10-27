"use client";

import { Button } from "@drishya/ui/components/button";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { ArrowDown, ArrowRight, RotateCcw } from "lucide-react";
import { useState } from "react";

const scenes = [
  {
    title: "One loop. Three hellos.",
    caption: "A loop repeats an action for every item in a collection.",
    active: -1,
  },
  {
    title: "Meet the first item.",
    caption: "First, name becomes Asha. The indented line says hello to her.",
    active: 0,
  },
  {
    title: "Then do it again.",
    caption:
      "The same instruction runs for Ravi, then Meera. One loop, three greetings.",
    active: 2,
  },
];

export function LessonPreview() {
  const [step, setStep] = useState(0);
  const scene = scenes[step];
  return (
    <WindowPanel
      title="A lesson, at a glance"
      accent="green"
      className="relative"
    >
      <div className="flex items-center justify-between border-b-[1.5px] border-ink bg-green px-5 py-3">
        <span className="flex items-center gap-2 text-xs">
          <span className="size-1.5 rounded-full bg-ink" />
          Python for beginners
        </span>
        <span className="font-mono text-[10px]">STORYBOARD PREVIEW</span>
      </div>
      <div className="paper-grid px-5 py-7 sm:px-7">
        <h3
          className="mb-5 text-center font-display text-[2rem] leading-tight"
          aria-live="polite"
        >
          {scene.title}
        </h3>
        <div className="border-[1.5px] border-ink bg-card p-4">
          <div className="mb-3 flex gap-1.5" aria-hidden="true">
            <span className="size-2 bg-pink" />
            <span className="size-2 bg-yellow" />
            <span className="size-2 bg-green" />
          </div>
          <pre className="overflow-x-auto font-mono text-[11px] leading-7 sm:text-xs">
            <code>
              <span className="text-[#7c3763]">for</span> name{" "}
              <span className="text-[#7c3763]">in</span> [
              <span className="text-[#326b36]">"Asha", "Ravi", "Meera"</span>]:
              <br />
              <span className={step > 0 ? "bg-yellow-soft" : ""}>
                {" "}
                print(<span className="text-[#326b36]">"Hello,"</span>, name)
              </span>
            </code>
          </pre>
        </div>
        <div className="my-3 flex justify-center">
          <ArrowDown className="size-5" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["Asha", "Ravi", "Meera"].map((name, i) => (
            <div
              key={name}
              className={`border-[1.5px] border-ink px-1 py-3 text-center font-mono text-[10px] transition-colors sm:text-xs ${scene.active >= i ? "bg-green" : "bg-card"}`}
            >
              Hello, {name}
            </div>
          ))}
        </div>
      </div>
      <div
        className="min-h-[78px] border-t border-border bg-purple-soft px-5 py-4 text-[13px] leading-relaxed"
        aria-live="polite"
      >
        {scene.caption}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border p-4">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {scenes.map((item, i) => (
            <span
              key={item.title}
              className={`h-1.5 w-6 ${i === step ? "bg-ink" : "bg-paper-deep"}`}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setStep((step + 1) % scenes.length)}
        >
          {step === 2 ? <RotateCcw className="size-3.5" /> : null}
          {step === 2 ? "Start again" : "Next scene"}
          {step < 2 && <ArrowRight className="size-3.5" />}
        </Button>
      </div>
    </WindowPanel>
  );
}
