import { Button } from "@drishya/ui/components/button";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Languages,
  MonitorPlay,
  Shapes,
} from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { LessonPreview } from "@/components/lesson-preview";

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
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Brand />
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-3 sm:gap-6"
          >
            <a
              href="#how-it-works"
              className="hidden text-sm text-ink-muted underline-offset-4 hover:underline md:block"
            >
              How it works
            </a>
            <Link
              href="/sign-in"
              className="text-sm underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link href="/sign-up">
                Get started
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <section
          className="grid items-center gap-12 pb-16 pt-14 lg:grid-cols-[1.08fr_1fr] lg:gap-16 lg:pb-24 lg:pt-20"
          aria-labelledby="hero-title"
        >
          <div>
            <p className="field-label mb-5 flex items-center gap-2">
              <span className="size-2.5 border border-ink bg-pink" />A visual
              teaching studio
            </p>
            <h1
              id="hero-title"
              className="max-w-[9ch] font-display text-[clamp(3.7rem,7.5vw,6.4rem)] leading-[.98] tracking-[-.025em]"
            >
              Some things
              <br />
              just need
              <br />
              to be seen.
            </h1>
            <p className="mb-7 mt-6 max-w-[40ch] text-base leading-relaxed text-ink-muted sm:text-lg">
              A tricky concept. A curious question. Turn it into a short visual
              lesson you can actually follow.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Make room for curiosity
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <a
                href="#how-it-works"
                className="text-xs text-ink-muted underline underline-offset-4"
              >
                Take a look around
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5">
                <Clapperboard className="size-3.5" />
                Short, focused lessons
              </span>
              <span className="flex items-center gap-1.5">
                <Languages className="size-3.5" />
                In your language
              </span>
            </div>
          </div>
          <div className="min-w-0 lg:pt-6">
            <LessonPreview />
            <p className="mt-4 text-center font-mono text-[10px] text-ink-muted">
              A hand-built example of the learning experience.
            </p>
          </div>
        </section>

        <section
          id="how-it-works"
          className="scroll-mt-8 border-t-[1.5px] border-ink py-12 sm:py-16"
          aria-labelledby="how-title"
        >
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <h2
              id="how-title"
              className="font-display text-[2.6rem] leading-tight"
            >
              From “what?” to “oh, I get it.”
            </h2>
            <p className="max-w-[32ch] text-sm text-ink-muted">
              Less information overload.
              <br />
              More one-thing-at-a-time understanding.
            </p>
          </div>
          <ol className="grid gap-5 md:grid-cols-3">
            {[
              {
                number: "01",
                title: "Bring your question",
                text: "Start with a topic, a doubt, or an idea you’ve been meaning to understand.",
                icon: BookOpen,
                color: "bg-pink",
                label: "The starting point",
              },
              {
                number: "02",
                title: "Find the right-sized idea",
                text: "Big subjects become small chapters. Each lesson gives one clear idea the room it needs.",
                icon: Shapes,
                color: "bg-yellow",
                label: "A little structure",
              },
              {
                number: "03",
                title: "Watch it make sense",
                text: "Follow the story through narration, diagrams, and examples. Revisit it at your own pace.",
                icon: MonitorPlay,
                color: "bg-green",
                label: "The lightbulb moment",
              },
            ].map(({ number, title, text, icon: Icon, color, label }) => (
              <li
                key={number}
                className="border-[1.5px] border-ink bg-card shadow-[var(--shadow-sm)]"
              >
                <div
                  className={`flex items-center justify-between border-b-[1.5px] border-ink px-5 py-3 ${color}`}
                >
                  <span className="font-mono text-[10px] uppercase tracking-[.06em]">
                    {label}
                  </span>
                  <Icon className="size-4" />
                </div>
                <div className="p-5">
                  <span className="font-display text-4xl">{number}</span>
                  <h3 className="mb-2 mt-3 font-display text-[1.8rem] leading-tight">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-ink-muted">
                    {text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="pb-14 sm:pb-20" aria-labelledby="invitation-title">
          <WindowPanel title="For the wonderfully curious" accent="purple">
            <div className="flex flex-wrap items-center justify-between gap-6 bg-purple-soft px-6 py-8 sm:px-9 sm:py-10">
              <div>
                <h2
                  id="invitation-title"
                  className="font-display text-[2.4rem] leading-tight"
                >
                  Keep asking good questions.
                </h2>
                <p className="mt-3 max-w-[55ch] text-sm text-ink-muted">
                  Drishya is just getting started. Create your account and save
                  the idea you want to explore first.
                </p>
              </div>
              <Button variant="secondary" asChild>
                <Link href="/sign-up">
                  Find your starting point
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </WindowPanel>
        </section>
      </main>
      <footer className="border-t-[1.5px] border-ink bg-paper">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-6 text-xs text-ink-muted sm:px-8">
          <span>Drishya · A clearer way to learn.</span>
          <span>Early preview. Lesson generation is being built.</span>
        </div>
      </footer>
    </div>
  );
}
