"use client";

import {
  type PlanRequest,
  languageSchema,
  levelSchema,
} from "@drishya/contracts";
import { Button } from "@drishya/ui/components/button";
import { Label } from "@drishya/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@drishya/ui/components/select";
import { Textarea } from "@drishya/ui/components/textarea";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { ArrowRight, FileText, LoaderCircle } from "lucide-react";
import type { createWorkspaceStore } from "@/stores/workspace";
import { useStore } from "zustand";

export function PlanningForm({
  store,
  pending,
  error,
  onPlan,
}: {
  store: ReturnType<typeof createWorkspaceStore>;
  pending: boolean;
  error: string;
  onPlan: (input: PlanRequest) => void;
}) {
  const state = useStore(store);
  return (
    <WindowPanel title="Your next lesson" accent="pink">
      <div className="border-b-[1.5px] border-ink bg-pink px-6 py-4">
        <h2 className="font-display text-[1.9rem] leading-tight">
          What are we learning today?
        </h2>
        <p className="mt-1 text-sm">
          Start broad. We’ll help you find the focus.
        </p>
      </div>
      <form
        className="space-y-5 p-6"
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          onPlan({
            topic: state.topic,
            language: state.language,
            level: state.level,
            approach: state.approach,
            targetDurationSeconds: state.targetDurationSeconds,
          });
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="topic" className="field-label">
            Topic or question
          </Label>
          <Textarea
            id="topic"
            value={state.topic}
            onChange={(event) => state.setTopic(event.target.value)}
            minLength={2}
            maxLength={500}
            placeholder="e.g. Python programming, or how a for-loop works"
            className="min-h-28 resize-y"
            disabled={pending}
            required
            aria-describedby="topic-help"
          />
          <p id="topic-help" className="text-xs text-ink-muted">
            A broad subject becomes chapters. A focused question becomes one
            lesson.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="level" className="field-label">
              Learner level
            </Label>
            <Select
              value={state.level}
              onValueChange={(value) =>
                state.setLevel(levelSchema.parse(value))
              }
              disabled={pending}
            >
              <SelectTrigger id="level" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language" className="field-label">
              Lesson language
            </Label>
            <Select
              value={state.language}
              onValueChange={(value) =>
                state.setLanguage(languageSchema.parse(value))
              }
              disabled={pending}
            >
              <SelectTrigger id="language" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">Hindi · हिन्दी</SelectItem>
                <SelectItem value="mr">Marathi · मराठी</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration" className="field-label">
              Per chapter
            </Label>
            <Select
              value={String(state.targetDurationSeconds)}
              onValueChange={(value) => state.setTargetDuration(Number(value))}
              disabled={pending}
            >
              <SelectTrigger id="duration" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[30, 45, 60, 90].map((seconds) => (
                  <SelectItem key={seconds} value={String(seconds)}>
                    {seconds} seconds
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="approach" className="field-label">
              Learning goal
            </Label>
            <Select
              value={state.approach}
              onValueChange={(value) =>
                state.setApproach(value === "overview" ? "overview" : "lesson")
              }
              disabled={pending}
            >
              <SelectTrigger id="approach" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lesson">Learn a skill</SelectItem>
                <SelectItem value="overview">Get an overview</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          Outlines are written in English. Your language choice is saved for
          narration and localization in the next phases.
        </p>
        {error && (
          <p
            role="alert"
            className="border-l-4 border-destructive bg-[var(--red-soft)] p-3 text-sm"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <Button
            type="submit"
            disabled={pending || state.topic.trim().length < 2}
          >
            {pending ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <ArrowRight className="size-3.5" />
            )}
            {pending ? "Starting…" : "Plan my lesson"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || !state.topic.trim()}
            onClick={state.saveDraft}
          >
            <FileText className="size-3.5" />
            Save draft
          </Button>
        </div>
        <p role="status" className="text-xs text-ink-muted">
          {state.savedAt
            ? "Draft saved on this device."
            : "Planning runs on your local Qwen model."}
        </p>
      </form>
    </WindowPanel>
  );
}
