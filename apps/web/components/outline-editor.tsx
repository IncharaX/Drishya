"use client";

import {
  type ProjectDetail,
  type SavedChapter,
  outlineUpdateSchema,
} from "@drishya/contracts";
import { Button } from "@drishya/ui/components/button";
import { Input } from "@drishya/ui/components/input";
import { Label } from "@drishya/ui/components/label";
import { Textarea } from "@drishya/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, LoaderCircle, Save } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { projectError, saveOutline } from "@/lib/projects";

export function OutlineEditor({
  detail,
  onSaved,
  onDirty,
  onReload,
}: {
  detail: ProjectDetail;
  onSaved: (detail: ProjectDetail) => void;
  onDirty: (dirty: boolean) => void;
  onReload: () => void;
}) {
  const [chapters, setChapters] = useState(detail.chapters);
  const [selectedId, setSelectedId] = useState<string | null>(
    detail.chapters.find((item) => item.isSelected)?.id ?? null,
  );
  const [validationError, setValidationError] = useState("");
  const dirty =
    JSON.stringify(chapters) !== JSON.stringify(detail.chapters) ||
    selectedId !==
      (detail.chapters.find((item) => item.isSelected)?.id ?? null);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const save = useMutation({
    mutationFn: () => {
      const input = outlineUpdateSchema.parse({
        revision: detail.project.revision,
        chapters: chapters.map(
          ({
            id,
            title,
            objective,
            estimatedDurationSeconds,
            prerequisites,
          }) => ({
            id,
            title,
            objective,
            estimatedDurationSeconds,
            prerequisites,
          }),
        ),
        selectedChapterId: selectedId,
      });
      return saveOutline(detail.project.id, input);
    },
    onSuccess: onSaved,
  });
  function edit(id: string, field: "title" | "objective", value: string) {
    setChapters((items) =>
      items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
    setValidationError("");
    save.reset();
  }
  function move(index: number, offset: number) {
    setChapters((items) => {
      const next = [...items];
      const a = next[index];
      const b = next[index + offset];
      if (a && b) {
        next[index] = b;
        next[index + offset] = a;
      }
      return next;
    });
  }
  const selected = chapters.find((item) => item.id === selectedId);
  return (
    <form
      className="space-y-5"
      aria-busy={save.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        if (
          chapters.some(
            (item) =>
              item.title.trim().length < 2 || item.objective.trim().length < 10,
          )
        ) {
          setValidationError(
            "Each chapter needs a title and a learning objective of at least 10 characters.",
          );
          return;
        }
        save.mutate();
      }}
    >
      <p className="text-xs leading-relaxed text-ink-muted">
        Edit the titles and objectives, arrange the chapters, then select one
        for scripting. Review prerequisites after reordering.
      </p>
      <ol className="space-y-4">
        {chapters.map((item: SavedChapter, index) => (
          <li
            key={item.id}
            className={`border bg-card ${selectedId === item.id ? "border-ink" : "border-border"}`}
          >
            <div
              className={`flex items-center gap-2 border-b border-border px-4 py-2 ${selectedId === item.id ? "bg-green-soft" : "bg-paper"}`}
            >
              <span className="font-mono text-xs">Chapter {index + 1}</span>
              <span className="ml-auto text-[11px] text-ink-muted">
                ~{item.estimatedDurationSeconds}s
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Move chapter ${index + 1} up`}
                onClick={() => move(index, -1)}
                disabled={index === 0 || save.isPending}
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Move chapter ${index + 1} down`}
                onClick={() => move(index, 1)}
                disabled={index === chapters.length - 1 || save.isPending}
              >
                <ArrowDown className="size-3.5" />
              </Button>
            </div>
            <div className="space-y-3 p-4">
              <div className="space-y-1.5">
                <Label className="field-label" htmlFor={`title-${item.id}`}>
                  Title
                </Label>
                <Input
                  id={`title-${item.id}`}
                  value={item.title}
                  onChange={(event) =>
                    edit(item.id, "title", event.target.value)
                  }
                  required
                  minLength={2}
                  maxLength={120}
                  disabled={save.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="field-label" htmlFor={`objective-${item.id}`}>
                  Learning objective
                </Label>
                <Textarea
                  id={`objective-${item.id}`}
                  value={item.objective}
                  onChange={(event) =>
                    edit(item.id, "objective", event.target.value)
                  }
                  required
                  minLength={10}
                  maxLength={500}
                  disabled={save.isPending}
                  className="min-h-20"
                />
              </div>
              {item.prerequisites.length > 0 && (
                <p className="text-xs text-ink-muted">
                  <span className="font-medium">Assumes: </span>
                  {item.prerequisites.join("; ")}
                </p>
              )}
              <label className="flex cursor-pointer items-center gap-2 border-t border-border pt-3 text-xs">
                <input
                  type="radio"
                  name="selectedChapter"
                  value={item.id}
                  checked={selectedId === item.id}
                  onChange={() => setSelectedId(item.id)}
                  disabled={save.isPending}
                  className="size-4 accent-ink"
                />
                Select this chapter for scripting
              </label>
            </div>
          </li>
        ))}
      </ol>
      {(validationError || save.isError) && (
        <div
          role="alert"
          className="space-y-2 border-l-4 border-destructive bg-[var(--red-soft)] p-3 text-sm"
        >
          <p>{validationError || projectError(save.error)}</p>
          {save.isError && (
            <Button type="button" size="sm" variant="ghost" onClick={onReload}>
              Reload saved outline
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="submit" disabled={!dirty || save.isPending}>
          {save.isPending ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          {save.isPending ? "Saving…" : "Save outline"}
        </Button>
        <span role="status" className="text-xs text-ink-muted">
          {dirty ? "Unsaved changes" : "Saved to your account"}
        </span>
      </div>
      {selected && (
        <div className="flex items-start gap-2 border border-border bg-green-soft p-3 text-sm">
          <Check className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>{selected.title}</strong>
            <br />
            <span className="text-xs text-ink-muted">
              {dirty
                ? "Save to keep this selection."
                : "Selected and saved. Open the chapter studio to write its script and storyboard."}
            </span>
          </p>
        </div>
      )}
      {selected && !dirty && (
        <Button asChild variant="outline">
          <Link
            href={`/workspace/${detail.project.id}/chapters/${selected.id}`}
          >
            Open script & storyboard
          </Link>
        </Button>
      )}
      <p className="text-xs leading-relaxed text-ink-muted">
        Times are estimates per chapter. Narration will determine the actual
        duration later. This outline has not been fact-checked.
      </p>
    </form>
  );
}
