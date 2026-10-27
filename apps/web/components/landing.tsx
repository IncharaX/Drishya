"use client";

import { ExplanationComposition, planFrames } from "@drishya/motion";
import { examplePlan } from "@drishya/motion/examples";
import { Button } from "@drishya/ui/components/button";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { Player } from "@remotion/player";
import { ArrowRight, Check, MessageCircle, Play, Workflow } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";

const sample = examplePlan("solar");
const steps = [
  {
    number: "01",
    icon: MessageCircle,
    title: "Describe it",
    text: "Ask a question or paste the exact steps of your flow. Choose a few preferences in one card.",
    color: "bg-pink-soft",
  },
  {
    number: "02",
    icon: Workflow,
    title: "Let it take shape",
    text: "Your explanation, voice and animation come together automatically. Chapters appear only when the combined coverage needs over 2 minutes.",
    color: "bg-yellow-soft",
  },
  {
    number: "03",
    icon: Check,
    title: "Make it yours",
    text: "Ask for a clearer section, a different colour or a new language. Every version stays in the conversation.",
    color: "bg-green-soft",
  },
];

export function Landing() {
  return (
    <div className="paper-grid min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-20 focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <header className="border-b-[1.5px] border-ink bg-paper">
        <div className="mx-auto flex min-h-[90px] max-w-[1400px] items-center justify-between gap-5 px-5 sm:px-10">
          <Brand />
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-4 text-sm sm:gap-7"
          >
            <Link
              href="/sign-in"
              className="underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
            <Button asChild>
              <Link href="/workspace">
                Open studio <ArrowRight className="size-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main">
        <section
          className="mx-auto grid max-w-[1400px] items-center gap-12 px-5 py-16 sm:px-10 sm:py-24 lg:grid-cols-[.85fr_1.15fr] lg:gap-14 lg:py-28"
          aria-labelledby="landing-title"
        >
          <div>
            <p className="field-label flex items-center gap-2.5">
              <span className="size-2.5 border border-ink bg-pink" />
              An idea deserves more than a paragraph.
            </p>
            <h1
              id="landing-title"
              className="my-6 font-display text-[clamp(3.8rem,6.2vw,6rem)] leading-[1.02] tracking-[-.025em]"
            >
              Don’t just say it.
              <br />
              Make it click.
            </h1>
            <p className="mb-8 max-w-[40ch] text-base leading-relaxed text-ink-muted sm:text-lg">
              Turn a concept, a process, or a story into an animated
              explanation. Start with a conversation. Leave with a video.
            </p>
            <Button asChild size="lg">
              <Link href="/workspace">
                Create your first video <ArrowRight className="size-4" />
              </Link>
            </Button>
            <p className="mt-5 font-mono text-[11px] text-ink-muted">
              In English, Hindi, Kannada and Telugu.
            </p>
          </div>
          <div className="min-w-0">
            <WindowPanel title="Our solar system" accent="pink">
              <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 font-mono text-[10px] uppercase tracking-[.05em] text-ink-muted">
                <span className="flex items-center gap-2">
                  <Play className="size-3" /> Example animation
                </span>
                <span>3D · Motion</span>
              </div>
              <Player
                component={ExplanationComposition}
                inputProps={{ plan: sample, muted: true }}
                durationInFrames={planFrames(sample)}
                compositionWidth={1280}
                compositionHeight={720}
                fps={30}
                initialFrame={45}
                controls
                style={{ width: "100%", aspectRatio: "16/9" }}
              />
              <p className="border-t border-border bg-card px-4 py-3 font-mono text-[10px] text-ink-muted">
                A visual reference, built with Remotion.
              </p>
            </WindowPanel>
          </div>
        </section>
        <section
          className="border-y-[1.5px] border-ink bg-card"
          aria-labelledby="how-title"
        >
          <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-10 sm:py-20">
            <h2
              id="how-title"
              className="mb-10 font-display text-[clamp(2.5rem,4vw,3.7rem)] leading-[1.1] tracking-[-.02em]"
            >
              From “how does this work?”
              <br />
              to “now I get it.”
            </h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {steps.map(({ number, icon: Icon, title, text, color }) => (
                <li
                  key={number}
                  className="border-[1.5px] border-ink bg-card shadow-[var(--shadow)]"
                >
                  <div
                    className={`flex items-center justify-between border-b-[1.5px] border-ink px-5 py-3 ${color}`}
                  >
                    <span className="font-mono text-xs">{number}</span>
                    <Icon className="size-4" />
                  </div>
                  <div className="p-6">
                    <h3 className="mb-3 font-display text-3xl">{title}</h3>
                    <p className="max-w-[35ch] text-sm leading-relaxed text-ink-muted">
                      {text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <footer className="bg-paper">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-6 px-5 py-9 sm:px-10">
          <Brand />
          <span className="text-xs text-ink-muted">Your ideas, in motion.</span>
          <Link
            className="flex items-center gap-2 font-mono text-xs uppercase tracking-[.04em] underline underline-offset-4"
            href="/workspace"
          >
            Start creating <ArrowRight className="size-4" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
