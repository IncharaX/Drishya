"use client";

import type { ProjectDetail } from "@drishya/contracts";
import { Button } from "@drishya/ui/components/button";
import { Label } from "@drishya/ui/components/label";
import { Textarea } from "@drishya/ui/components/textarea";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { BookOpen, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { OutlineEditor } from "./outline-editor";

export function PlanningResult({
  detail,
  pending,
  error,
  onContinue,
  onSaved,
  onDirty,
  onReload,
}: {
  detail: ProjectDetail;
  pending: boolean;
  error: string;
  onContinue: (answer?: string) => void;
  onSaved: (detail: ProjectDetail) => void;
  onDirty: (dirty: boolean) => void;
  onReload: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const { project, chapters } = detail;
  const planning = project.status === "planning";
  return (
    <WindowPanel
      title={
        planning
          ? "Finding the focus"
          : project.status === "ready"
            ? "Your chapter outline"
            : "Let’s shape your lesson"
      }
      accent="green"
    >
      <div className="border-b-[1.5px] border-ink bg-green px-6 py-4">
        <h2 className="font-display text-[1.9rem] leading-tight">
          {project.title}
        </h2>
        <p className="mt-1 text-xs">
          {project.request.level} · {project.request.targetDurationSeconds}s per
          chapter ·{" "}
          {project.request.approach === "overview"
            ? "overview"
            : "focused lessons"}
        </p>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        {planning && (
          <div className="flex gap-3 bg-purple-soft p-4" role="status">
            <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin" />
            <div>
              <p className="text-sm font-medium">
                {project.stage === "repairing"
                  ? "Refining the outline format…"
                  : "Assessing the topic and planning…"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                The local model may need a few minutes. You can reopen this
                project while it works. Video length is separate from planning
                time.
              </p>
            </div>
          </div>
        )}
        {project.scope && (
          <div className="space-y-3 border-b border-border pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="field-label">
                {project.scope.decision === "single"
                  ? "One focused lesson"
                  : project.scope.decision === "chapters"
                    ? `${chapters.length} focused chapters`
                    : "One quick clarification"}
              </p>
              <span className="font-mono text-[10px] text-ink-muted">
                {project.model}
              </span>
            </div>
            <p className="text-sm">{project.scope.interpretedSubject}</p>
            <p className="text-sm leading-relaxed text-ink-muted">
              {project.scope.rationale}
            </p>
            {project.scope.prerequisites.length > 0 && (
              <p className="text-xs text-ink-muted">
                <strong>Before you start: </strong>
                {project.scope.prerequisites.join("; ")}
              </p>
            )}
          </div>
        )}
        {project.status === "needs_clarification" &&
          project.scope?.clarification && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (answer.trim()) onContinue(answer.trim());
              }}
            >
              <h3 className="font-display text-2xl">
                {project.scope.clarification.question}
              </h3>
              <div className="flex flex-wrap gap-2">
                {project.scope.clarification.choices.map((choice) => (
                  <Button
                    key={choice}
                    type="button"
                    variant={answer === choice ? "default" : "outline"}
                    size="sm"
                    className="h-auto min-h-8 whitespace-normal text-left"
                    disabled={pending}
                    onClick={() => setAnswer(choice)}
                  >
                    {choice}
                  </Button>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="clarification" className="field-label">
                  Your answer
                </Label>
                <Textarea
                  id="clarification"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  maxLength={500}
                  required
                  disabled={pending}
                  placeholder="Choose an option above, or explain what you mean."
                />
              </div>
              <Button type="submit" disabled={pending || !answer.trim()}>
                {pending ? "Continuing…" : "Continue planning"}
              </Button>
            </form>
          )}
        {project.status === "failed" && (
          <div className="space-y-4">
            <p
              role="alert"
              className="border-l-4 border-destructive bg-[var(--red-soft)] p-3 text-sm"
            >
              {project.errorMessage ??
                "Planning could not finish. Please try again."}
            </p>
            <Button disabled={pending} onClick={() => onContinue()}>
              <RefreshCw className="size-3.5" />
              {pending ? "Restarting…" : "Retry planning"}
            </Button>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="border-l-4 border-destructive bg-[var(--red-soft)] p-3 text-sm"
          >
            {error}
          </p>
        )}
        {project.status === "ready" && (
          <OutlineEditor
            key={`${project.id}:${project.revision}`}
            detail={detail}
            onSaved={onSaved}
            onDirty={onDirty}
            onReload={onReload}
          />
        )}
      </div>
    </WindowPanel>
  );
}

export function PlanningEmpty() {
  return (
    <WindowPanel title="A little structure, a lot of clarity" accent="green">
      <div className="paper-grid px-6 py-12 text-center">
        <BookOpen className="mx-auto mb-5 size-8" />
        <h2 className="font-display text-3xl">Big topics. Small steps.</h2>
        <p className="mx-auto mt-3 max-w-[36ch] text-sm leading-relaxed text-ink-muted">
          Tell us what you want to learn. Your outline will appear here, with a
          clear objective for every chapter.
        </p>
      </div>
      <div className="space-y-3 border-t border-border p-5">
        {[
          "Choose a topic and learner level.",
          "Review the scope and refine your chapters.",
          "Save a chapter to take into scripting.",
        ].map((text, i) => (
          <p key={text} className="flex items-center gap-3 text-xs">
            <span className="grid size-6 place-items-center border border-ink bg-yellow-soft font-mono text-[10px]">
              {i + 1}
            </span>
            {text}
          </p>
        ))}
      </div>
    </WindowPanel>
  );
}
