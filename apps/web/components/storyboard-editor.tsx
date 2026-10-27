"use client";

import {
  type LessonDetail,
  type Scene,
  type Storyboard,
  narrationWords,
  storyboardIssues,
  storyboardSchema,
} from "@drishya/contracts";
import { SceneCanvas } from "@drishya/renderer";
import { Button } from "@drishya/ui/components/button";
import { Input } from "@drishya/ui/components/input";
import { Label } from "@drishya/ui/components/label";
import { Textarea } from "@drishya/ui/components/textarea";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { projectError } from "@/lib/projects";
import { saveStoryboard } from "@/lib/storyboards";

function newScene(type: Scene["type"]): Scene {
  const common = {
    id: `s_${crypto.randomUUID().slice(0, 8)}`,
    title: "New scene",
    narration: "Write the spoken explanation for this scene.",
    sourceIds: [] as string[],
  };
  if (type === "diagram")
    return {
      ...common,
      type,
      layout: "flow",
      nodes: [
        { id: "start", label: "Starting idea" },
        { id: "result", label: "Result" },
      ],
      edges: [{ from: "start", to: "result", label: "leads to" }],
      caption: "Describe the connection.",
    };
  if (type === "code")
    return {
      ...common,
      type,
      language: "python",
      code: 'print("Hello")',
      focusLines: [1],
      caption: "Explain the highlighted line.",
    };
  return { ...common, type, subtitle: "Explain the key idea.", bullets: [] };
}

function FocusLinesInput({
  lines,
  disabled,
  onChange,
}: {
  lines: number[];
  disabled: boolean;
  onChange: (lines: number[]) => void;
}) {
  const [text, setText] = useState(lines.join(", "));
  return (
    <Input
      id="focus-lines"
      value={text}
      maxLength={80}
      disabled={disabled}
      onChange={(event) => {
        setText(event.target.value);
        onChange(
          event.target.value
            .split(/[,\s]+/u)
            .filter(Boolean)
            .map(Number),
        );
      }}
    />
  );
}

export function StoryboardEditor({
  lesson,
  projectId,
  chapterId,
  readOnly,
  onSaved,
  onDirty,
}: {
  lesson: LessonDetail;
  projectId: string;
  chapterId: string;
  readOnly: boolean;
  onSaved: (lesson: LessonDetail) => void;
  onDirty: (value: boolean) => void;
}) {
  const [content, setContent] = useState<Storyboard>(
    () => lesson.content as Storyboard,
  );
  const [index, setIndex] = useState(0);
  const scene = content.scenes[index];
  const dirty = JSON.stringify(content) !== JSON.stringify(lesson.content);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const parsed = storyboardSchema.safeParse(content);
  const issues = parsed.success
    ? storyboardIssues(
        parsed.data,
        lesson.input.request.targetDurationSeconds,
        lesson.references,
      )
    : parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const save = useMutation({
    mutationFn: () =>
      saveStoryboard(
        projectId,
        chapterId,
        lesson.id,
        storyboardSchema.parse(content),
      ),
    onSuccess: onSaved,
  });
  const disabled = readOnly || save.isPending;
  function editScene(next: Scene) {
    setContent((current) => ({
      ...current,
      scenes: current.scenes.map((item, i) => (i === index ? next : item)),
    }));
    save.reset();
  }
  function move(offset: number) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= content.scenes.length) return;
    const scenes = [...content.scenes];
    const other = scenes[nextIndex];
    if (!scene || !other) return;
    scenes[index] = other;
    scenes[nextIndex] = scene;
    setContent({ ...content, scenes });
    setIndex(nextIndex);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { content, references: lesson.references, input: lesson.input },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `drishya-storyboard-v${lesson.version}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  if (!scene) return null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 border border-ink bg-card p-4">
        <span className="mr-auto text-xs text-ink-muted">
          {content.scenes.length} scenes · {narrationWords(content)} narration
          words · target {lesson.input.request.targetDurationSeconds}s
        </span>
        <Button variant="outline" size="sm" onClick={download}>
          <Download className="size-3.5" />
          Download JSON
        </Button>
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={disabled || !dirty || issues.length > 0}
        >
          <Save className="size-3.5" />
          {save.isPending ? "Saving…" : "Save new version"}
        </Button>
        <span role="status" className="text-xs text-ink-muted">
          {dirty ? "Unsaved changes" : `Saved version ${lesson.version}`}
        </span>
      </div>
      {save.isError && (
        <p
          role="alert"
          className="border-l-4 border-destructive bg-[var(--red-soft)] p-3 text-sm"
        >
          {projectError(save.error)}
        </p>
      )}
      {issues.length > 0 && (
        <div
          role="alert"
          className="border border-border bg-yellow-soft p-4 text-xs"
        >
          <p className="mb-2 font-medium">Resolve these before saving:</p>
          <ul className="list-disc space-y-1 pl-4">
            {issues.slice(0, 8).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <WindowPanel title="Script & scene editor" accent="pink">
          <div className="space-y-5 p-5">
            <div className="space-y-2">
              <Label htmlFor="lesson-title" className="field-label">
                Lesson title
              </Label>
              <Input
                id="lesson-title"
                value={content.title}
                onChange={(event) =>
                  setContent({ ...content, title: event.target.value })
                }
                maxLength={120}
                disabled={disabled}
              />
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              <strong>Learning objective: </strong>
              {content.learningObjective}
            </p>
            <ol className="flex flex-wrap gap-2" aria-label="Storyboard scenes">
              {content.scenes.map((item, i) => (
                <li key={item.id}>
                  <Button
                    type="button"
                    size="sm"
                    variant={index === i ? "default" : "outline"}
                    onClick={() => setIndex(i)}
                    aria-pressed={index === i}
                  >
                    {i + 1}. {item.type}
                  </Button>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <span className="mr-auto font-mono text-[11px] text-ink-muted">
                Scene {index + 1} · {scene.type}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move scene earlier"
                disabled={disabled || index === 0}
                onClick={() => move(-1)}
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move scene later"
                disabled={disabled || index === content.scenes.length - 1}
                onClick={() => move(1)}
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove this scene"
                disabled={disabled || content.scenes.length <= 3}
                onClick={() => {
                  setContent({
                    ...content,
                    scenes: content.scenes.filter((_, i) => i !== index),
                  });
                  setIndex(Math.max(0, index - 1));
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scene-title" className="field-label">
                Scene title
              </Label>
              <Input
                id="scene-title"
                value={scene.title}
                onChange={(event) =>
                  editScene({ ...scene, title: event.target.value })
                }
                maxLength={80}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="narration" className="field-label">
                Narration
              </Label>
              <Textarea
                id="narration"
                value={scene.narration}
                onChange={(event) =>
                  editScene({ ...scene, narration: event.target.value })
                }
                maxLength={700}
                disabled={disabled}
                className="min-h-28"
              />
              <p className="text-[11px] text-ink-muted">
                Spoken text only. Voiceover arrives in Phase 3.
              </p>
            </div>
            {scene.type === "title" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="subtitle" className="field-label">
                    Subtitle
                  </Label>
                  <Textarea
                    id="subtitle"
                    value={scene.subtitle}
                    onChange={(event) =>
                      editScene({ ...scene, subtitle: event.target.value })
                    }
                    maxLength={150}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bullets" className="field-label">
                    Key points · up to 3, one per line
                  </Label>
                  <Textarea
                    id="bullets"
                    value={scene.bullets.join("\n")}
                    onChange={(event) =>
                      editScene({
                        ...scene,
                        bullets: event.target.value
                          ? event.target.value.split("\n")
                          : [],
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              </>
            )}
            {scene.type === "diagram" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="diagram-layout" className="field-label">
                    Layout
                  </Label>
                  <select
                    id="diagram-layout"
                    value={scene.layout}
                    onChange={(event) =>
                      editScene({
                        ...scene,
                        layout:
                          event.target.value === "cycle" ? "cycle" : "flow",
                      })
                    }
                    disabled={disabled}
                    className="h-10 w-full border-[1.5px] border-ink bg-card px-3 text-sm"
                  >
                    <option value="flow">Flow</option>
                    <option value="cycle">Cycle</option>
                  </select>
                </div>
                <fieldset className="space-y-3">
                  <legend className="field-label mb-2">Diagram labels</legend>
                  {scene.nodes.map((node) => (
                    <div key={node.id} className="space-y-1">
                      <Label
                        htmlFor={`node-${node.id}`}
                        className="text-xs text-ink-muted"
                      >
                        {node.id}
                      </Label>
                      <Input
                        id={`node-${node.id}`}
                        value={node.label}
                        maxLength={48}
                        disabled={disabled}
                        onChange={(event) =>
                          editScene({
                            ...scene,
                            nodes: scene.nodes.map((item) =>
                              item.id === node.id
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </fieldset>
                <fieldset className="space-y-3">
                  <legend className="field-label mb-2">Labelled arrows</legend>
                  {scene.edges.map((edge, edgeIndex) => (
                    <div
                      key={`${scene.id}-${edgeIndex}`}
                      className="space-y-2 border border-border p-3"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        {(["from", "to"] as const).map((field) => (
                          <label
                            key={field}
                            className="space-y-1 text-[11px] text-ink-muted"
                          >
                            <span>{field === "from" ? "From" : "To"}</span>
                            <select
                              aria-label={`Arrow ${edgeIndex + 1} ${field}`}
                              value={edge[field]}
                              disabled={disabled}
                              className="h-9 w-full border border-ink bg-card px-2 text-xs"
                              onChange={(event) =>
                                editScene({
                                  ...scene,
                                  edges: scene.edges.map((item, i) =>
                                    i === edgeIndex
                                      ? { ...item, [field]: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            >
                              {scene.nodes.map((node) => (
                                <option key={node.id} value={node.id}>
                                  {node.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <Input
                        aria-label={`Arrow ${edgeIndex + 1} label`}
                        value={edge.label}
                        maxLength={24}
                        disabled={disabled}
                        onChange={(event) =>
                          editScene({
                            ...scene,
                            edges: scene.edges.map((item, i) =>
                              i === edgeIndex
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </fieldset>
              </div>
            )}
            {scene.type === "code" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="code" className="field-label">
                    Illustrative code · never executed
                  </Label>
                  <Textarea
                    id="code"
                    value={scene.code}
                    maxLength={1200}
                    onChange={(event) =>
                      editScene({ ...scene, code: event.target.value })
                    }
                    disabled={disabled}
                    spellCheck={false}
                    className="min-h-48 whitespace-pre font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="focus-lines" className="field-label">
                    Highlighted lines · comma-separated
                  </Label>
                  <FocusLinesInput
                    key={`${scene.id}-focus`}
                    lines={scene.focusLines}
                    onChange={(focusLines) =>
                      editScene({
                        ...scene,
                        focusLines,
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              </>
            )}
            {scene.type !== "title" && (
              <div className="space-y-2">
                <Label htmlFor="caption" className="field-label">
                  Visual caption
                </Label>
                <Textarea
                  id="caption"
                  value={scene.caption}
                  maxLength={150}
                  disabled={disabled}
                  onChange={(event) =>
                    editScene({ ...scene, caption: event.target.value })
                  }
                />
              </div>
            )}
            {lesson.references.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="field-label mb-2">
                  Supporting notes for this scene
                </legend>
                {lesson.references.map((reference) => (
                  <label
                    key={reference.id}
                    className="flex items-start gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={scene.sourceIds.includes(reference.id)}
                      onChange={(event) =>
                        editScene({
                          ...scene,
                          sourceIds: event.target.checked
                            ? [...scene.sourceIds, reference.id]
                            : scene.sourceIds.filter(
                                (id) => id !== reference.id,
                              ),
                        })
                      }
                      className="mt-0.5 accent-ink"
                    />
                    {reference.title}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <span className="w-full text-xs text-ink-muted">
                Add a scene · maximum 6
              </span>
              {(["title", "diagram", "code"] as const).map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant="outline"
                  disabled={disabled || content.scenes.length >= 6}
                  onClick={() => {
                    setContent({
                      ...content,
                      scenes: [...content.scenes, newScene(type)],
                    });
                    setIndex(content.scenes.length);
                  }}
                >
                  + {type}
                </Button>
              ))}
            </div>
          </div>
        </WindowPanel>
        <div className="space-y-5 xl:sticky xl:top-5">
          <WindowPanel title="Storyboard preview" accent="green">
            <div className="p-4">
              <SceneCanvas scene={scene} />
            </div>
            <div className="border-t border-border bg-purple-soft p-4">
              <p className="field-label mb-2">Narration</p>
              <p className="text-sm leading-relaxed">{scene.narration}</p>
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <Button
                size="sm"
                variant="ghost"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ArrowLeft className="size-3.5" />
                Previous
              </Button>
              <span className="font-mono text-[11px]">
                {index + 1} / {content.scenes.length}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={index === content.scenes.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                Next
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </WindowPanel>
          <p className="text-xs leading-relaxed text-ink-muted">
            Static scene preview. Narration is text for now; audio timing and
            MP4 export follow in later phases. Check the explanation and code
            before using it to teach.
          </p>
          <WindowPanel title="Bundled reference notes" accent="purple">
            <div className="space-y-4 p-5">
              {lesson.references.length === 0 ? (
                <p className="text-xs text-ink-muted">
                  No bundled reference matches this chapter. This is an
                  ungrounded model draft and needs content review.
                </p>
              ) : (
                lesson.references.map((reference) => (
                  <div key={reference.id}>
                    <a
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline underline-offset-4"
                    >
                      {reference.title}
                    </a>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-muted">
                      {reference.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-ink-muted">
                      {scene.sourceIds.includes(reference.id)
                        ? "Referenced by this scene."
                        : "Not referenced by this scene."}
                    </p>
                  </div>
                ))
              )}
              <p className="border-t border-border pt-3 text-[11px] text-ink-muted">
                Bundled paraphrases support review; they do not verify every
                generated claim. Opening source links needs connectivity.
              </p>
            </div>
          </WindowPanel>
        </div>
      </div>
    </div>
  );
}
