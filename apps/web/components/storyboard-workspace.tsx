"use client";

import type { LessonDetail } from "@drishya/contracts";
import { Button } from "@drishya/ui/components/button";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clapperboard, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/account-menu";
import { Brand } from "@/components/brand";
import { StoryboardEditor } from "@/components/storyboard-editor";
import { getProject, projectError } from "@/lib/projects";
import {
  generateStoryboard,
  getStoryboard,
  listStoryboards,
} from "@/lib/storyboards";

export function StoryboardWorkspace({
  userId,
  projectId,
  chapterId,
}: {
  userId: string;
  projectId: string;
  chapterId: string;
}) {
  const client = useQueryClient();
  const [versionId, setVersionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const listKey = ["storyboards", userId, projectId, chapterId];
  const project = useQuery({
    queryKey: ["project", userId, projectId],
    queryFn: () => getProject(projectId),
    staleTime: 0,
  });
  const chapter = project.data?.chapters.find((item) => item.id === chapterId);
  const history = useQuery({
    queryKey: listKey,
    queryFn: () => listStoryboards(projectId, chapterId),
    refetchInterval: (query) =>
      query.state.data?.versions.some(
        (item) => item.status === "drafting" || item.status === "repairing",
      )
        ? 2000
        : false,
  });
  const latestId = history.data?.versions[0]?.id;
  useEffect(() => {
    if (!versionId && latestId) setVersionId(latestId);
  }, [versionId, latestId]);
  const selectedId = versionId ?? latestId;
  const lesson = useQuery({
    queryKey: ["storyboard", userId, projectId, chapterId, selectedId],
    queryFn: () => getStoryboard(projectId, chapterId, selectedId ?? ""),
    enabled: Boolean(selectedId),
    staleTime: 0,
    refetchInterval: (query) =>
      ["drafting", "repairing"].includes(query.state.data?.status ?? "")
        ? 2000
        : false,
  });
  const status = lesson.data?.status;
  useEffect(() => {
    if (status === "ready" || status === "failed")
      void client.invalidateQueries({
        queryKey: ["storyboards", userId, projectId, chapterId],
      });
  }, [status, userId, projectId, chapterId, client]);
  const generating =
    history.data?.versions.some(
      (item) => item.status === "drafting" || item.status === "repairing",
    ) ?? false;
  function accept(data: LessonDetail) {
    client.setQueryData(
      ["storyboard", userId, projectId, chapterId, data.id],
      data,
    );
    setVersionId(data.id);
    setDirty(false);
    void client.invalidateQueries({ queryKey: listKey });
  }
  const generate = useMutation({
    mutationFn: () => generateStoryboard(projectId, chapterId),
    onSuccess: (data) => {
      accept(data);
      setNotice("");
    },
  });
  function canLeave() {
    return !dirty || window.confirm("Discard your unsaved storyboard edits?");
  }
  const readOnly = Boolean(
    lesson.data?.isStale ||
      lesson.data?.id !== latestId ||
      generating ||
      generate.isPending,
  );
  return (
    <div className="min-h-dvh bg-paper">
      <header className="flex flex-wrap items-center gap-4 border-b-[1.5px] border-ink px-5 py-3.5 sm:px-8">
        <Brand />
        <span className="hidden text-sm text-ink-muted sm:block">
          Script & storyboard studio
        </span>
        <div className="ml-auto">
          <AccountMenu onSignOut={() => client.clear()} />
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] space-y-6 px-5 py-9 sm:px-8">
        <Link
          href="/workspace"
          onClick={(event) => {
            if (!canLeave()) event.preventDefault();
          }}
          className="inline-flex items-center gap-2 text-xs text-ink-muted underline underline-offset-4"
        >
          <ArrowLeft className="size-3.5" />
          Back to chapter planning
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="field-label mb-3">One chapter. A clear story.</p>
            <h1 className="font-display text-[clamp(2.3rem,4vw,3.8rem)] leading-tight">
              {chapter?.title ?? "Your storyboard"}
            </h1>
            <p className="mt-3 max-w-[78ch] text-sm text-ink-muted">
              {chapter?.objective ??
                "Turn your selected chapter into narration and visual scenes."}
            </p>
          </div>
          <Button
            disabled={
              !chapter?.isSelected ||
              generating ||
              generate.isPending ||
              history.isPending ||
              history.isError
            }
            onClick={() => {
              if (canLeave()) generate.mutate();
            }}
          >
            {generate.isPending || generating ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Clapperboard className="size-4" />
            )}
            {generate.isPending
              ? "Starting…"
              : generating
                ? "Drafting…"
                : history.data?.versions.length
                  ? "Generate new version"
                  : "Generate script & storyboard"}
          </Button>
        </div>
        {project.isError && (
          <p role="alert" className="bg-[var(--red-soft)] p-4 text-sm">
            {projectError(project.error)}
          </p>
        )}
        {project.isSuccess && !chapter && (
          <p role="alert" className="bg-yellow-soft p-4 text-sm">
            This chapter was not found. Reopen the project from the planning
            workspace.
          </p>
        )}
        {chapter && !chapter.isSelected && (
          <p className="border border-border bg-yellow-soft p-3 text-sm">
            You can view saved versions here. To generate a new draft, select
            and save this chapter in the outline first.
          </p>
        )}
        {generate.isError && (
          <p
            role="alert"
            className="border-l-4 border-destructive bg-[var(--red-soft)] p-4 text-sm"
          >
            {projectError(generate.error)}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="border border-border bg-green-soft p-3 text-sm"
          >
            {notice}
          </p>
        )}
        {history.isError && (
          <div
            role="alert"
            className="space-y-2 bg-[var(--red-soft)] p-4 text-sm"
          >
            <p>{projectError(history.error)}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void history.refetch();
              }}
            >
              Reload versions
            </Button>
          </div>
        )}
        {history.data && history.data.versions.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-y border-border py-4">
            <label htmlFor="storyboard-version" className="field-label">
              Saved versions
            </label>
            <select
              id="storyboard-version"
              value={selectedId ?? ""}
              onChange={(event) => {
                if (canLeave()) {
                  setVersionId(event.target.value);
                  setDirty(false);
                  setNotice("");
                }
              }}
              className="max-w-full border-[1.5px] border-ink bg-card px-3 py-2 text-xs"
            >
              {history.data.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.version} · {version.origin} ·{" "}
                  {version.status}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-muted">
              Latest 30 versions. Earlier drafts are preserved.
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!canLeave()) return;
                const result = await history.refetch();
                const newest = result.data?.versions[0]?.id;
                if (newest) {
                  if (newest !== selectedId) setDirty(false);
                  setVersionId(newest);
                }
              }}
            >
              <RefreshCw className="size-3.5" />
              Open latest
            </Button>
          </div>
        )}
        {(history.isPending || (selectedId && lesson.isPending)) && (
          <p
            role="status"
            className="flex items-center gap-2 py-8 text-sm text-ink-muted"
          >
            <LoaderCircle className="size-4 animate-spin" />
            Loading your storyboard…
          </p>
        )}
        {history.data?.versions.length === 0 && (
          <WindowPanel title="Let’s tell the story" accent="green">
            <div className="paper-grid px-6 py-12">
              <h2 className="font-display text-3xl">
                Give the idea a voice and a visual.
              </h2>
              <p className="mt-4 max-w-[70ch] text-sm leading-relaxed text-ink-muted">
                Generate 3–6 scenes for this chapter, then edit the narration,
                labels, examples, and scene order. Your local Qwen model writes
                the draft; authored templates draw the preview.
              </p>
              <p className="mt-4 text-xs text-ink-muted">
                This phase creates a canonical English storyboard. Localized
                audio and video export come next.
              </p>
            </div>
          </WindowPanel>
        )}
        {lesson.isError && (
          <div
            role="alert"
            className="space-y-3 bg-[var(--red-soft)] p-4 text-sm"
          >
            <p>{projectError(lesson.error)}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void lesson.refetch();
              }}
            >
              Reload storyboard
            </Button>
          </div>
        )}
        {lesson.data &&
          ["drafting", "repairing"].includes(lesson.data.status) && (
            <WindowPanel title="Writing your teaching story" accent="purple">
              <div className="flex items-start gap-3 p-6" role="status">
                <LoaderCircle className="mt-1 size-5 animate-spin" />
                <div>
                  <h2 className="font-display text-2xl">
                    {lesson.data.status === "repairing"
                      ? "Refining the scene structure…"
                      : "Drafting narration and scenes…"}
                  </h2>
                  <p className="mt-3 text-sm text-ink-muted">
                    The local model may need a few minutes. This version is
                    saved, so you can reopen the chapter while it works.
                  </p>
                </div>
              </div>
            </WindowPanel>
          )}
        {lesson.data?.status === "failed" && (
          <div
            role="alert"
            className="space-y-3 border border-ink bg-[var(--red-soft)] p-5"
          >
            <p className="text-sm">{lesson.data.errorMessage}</p>
            <p className="text-xs text-ink-muted">
              Any earlier ready versions remain in the version picker.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={
                generate.isPending || generating || !chapter?.isSelected
              }
              onClick={() => generate.mutate()}
            >
              <RefreshCw className="size-3.5" />
              Generate another version
            </Button>
          </div>
        )}
        {lesson.data?.status === "ready" && lesson.data.content && (
          <>
            {lesson.data.isStale && (
              <p className="border border-border bg-yellow-soft p-4 text-sm">
                This storyboard uses an older chapter title, objective, or
                settings. It is read-only. Generate a fresh version from the
                saved chapter to continue.
              </p>
            )}
            {!lesson.data.isStale && readOnly && (
              <p className="bg-yellow-soft p-3 text-xs">
                This saved version is read-only. Open the latest ready version
                to edit; wait for any active generation to finish.
              </p>
            )}
            <StoryboardEditor
              key={lesson.data.id}
              lesson={lesson.data}
              projectId={projectId}
              chapterId={chapterId}
              readOnly={readOnly}
              onDirty={setDirty}
              onSaved={(data) => {
                accept(data);
                setNotice(
                  `Version ${data.version} saved. Previous versions are preserved.`,
                );
              }}
            />
          </>
        )}
        <footer className="border-t border-border pt-5 text-xs text-ink-muted">
          Drishya · Storyboards now. Narration and video in the next phases.
        </footer>
      </main>
    </div>
  );
}
