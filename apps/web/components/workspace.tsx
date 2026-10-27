"use client";

import { planRequestSchema, type ProjectDetail } from "@drishya/contracts";
import { Button } from "@drishya/ui/components/button";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clapperboard,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { GenerationJobs } from "./generation-jobs";
import { AccountMenu } from "@/components/account-menu";
import { Brand } from "@/components/brand";
import { PlanningForm } from "@/components/planning-form";
import { PlanningEmpty, PlanningResult } from "@/components/planning-result";
import {
  createProject,
  getProject,
  listProjects,
  projectError,
  retryProject,
} from "@/lib/projects";
import { createWorkspaceStore } from "@/stores/workspace";

const statusLabels = {
  planning: "Planning…",
  ready: "Outline ready",
  needs_clarification: "Your answer needed",
  failed: "Needs attention",
};

export function Workspace({ userId }: { userId: string }) {
  const [store] = useState(() => createWorkspaceStore(userId));
  const { activeProjectId, openProject, reset } = useStore(store);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [inputError, setInputError] = useState("");
  const client = useQueryClient();
  const listKey = ["projects", userId];
  const detailKey = ["project", userId, activeProjectId];
  useEffect(() => {
    void store.persist.rehydrate();
  }, [store]);

  const projects = useQuery({
    queryKey: listKey,
    queryFn: listProjects,
    refetchInterval: (query) =>
      query.state.data?.projects.some((item) => item.status === "planning")
        ? 5000
        : false,
  });
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => getProject(activeProjectId ?? ""),
    enabled: Boolean(activeProjectId),
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.project.status === "planning" ? 2000 : false,
  });
  const status = detail.data?.project.status;
  useEffect(() => {
    if (status && status !== "planning")
      void client.invalidateQueries({ queryKey: ["projects", userId] });
  }, [status, userId, client]);

  function acceptProject(data: ProjectDetail) {
    client.setQueryData(["project", userId, data.project.id], data);
    openProject(data.project.id);
    setDirty(false);
    setNotice("");
    void client.invalidateQueries({ queryKey: listKey });
  }
  const create = useMutation({
    mutationFn: createProject,
    onSuccess: acceptProject,
  });
  const retry = useMutation({
    mutationFn: ({ id, answer }: { id: string; answer?: string }) =>
      retryProject(id, answer),
    onSuccess: acceptProject,
  });

  function canLeave() {
    return !dirty || window.confirm("Discard your unsaved outline edits?");
  }
  function selectProject(id: string | null) {
    if (id === activeProjectId || !canLeave()) return;
    openProject(id);
    setDirty(false);
    setNotice("");
    setInputError("");
    create.reset();
    retry.reset();
  }
  function newTopic() {
    if (!canLeave()) return;
    reset();
    setDirty(false);
    setNotice("");
    setInputError("");
    create.reset();
    retry.reset();
  }
  function saved(data: ProjectDetail) {
    client.setQueryData(["project", userId, data.project.id], data);
    setDirty(false);
    setNotice("Outline and chapter selection saved.");
    void client.invalidateQueries({ queryKey: listKey });
  }

  return (
    <div className="min-h-dvh bg-paper">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:z-20 focus:bg-card focus:p-3"
      >
        Skip to workspace
      </a>
      <header className="flex flex-wrap items-center gap-4 border-b-[1.5px] border-ink px-5 py-3.5 sm:px-8">
        <Brand />
        <span className="hidden border-l border-border pl-4 text-sm text-ink-muted sm:block">
          Your visual teaching studio
        </span>
        <div className="ml-auto">
          <AccountMenu
            onSignOut={() => {
              reset();
              client.clear();
            }}
          />
        </div>
      </header>
      <main
        id="workspace"
        className="mx-auto max-w-[1320px] px-5 pb-12 pt-10 sm:px-8 sm:pt-12"
      >
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="field-label mb-3">A little clarity goes a long way</p>
            <h1 className="font-display text-[clamp(2.8rem,5vw,4.5rem)] leading-[1.02] tracking-[-.01em]">
              Find your first chapter.
            </h1>
            <p className="mt-4 max-w-[56ch] text-sm text-ink-muted">
              Turn a topic into a focused learning plan. Review it, make it
              yours, and choose where to begin.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 border border-ink bg-yellow-soft px-3 py-2 font-mono text-[10px] sm:flex">
              <Clapperboard className="size-3.5" />
              30–90s per chapter
            </span>
            <Link href="/workspace/library" className="text-sm underline">
              Lesson library
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={newTopic}
              disabled={create.isPending || retry.isPending}
            >
              <Plus className="size-3.5" />
              New topic
            </Button>
          </div>
        </div>
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.2fr)]">
          <div className="space-y-6">
            <GenerationJobs
              userId={userId}
              projectId={activeProjectId ?? undefined}
            />
            <PlanningForm
              store={store}
              pending={create.isPending}
              error={
                inputError || (create.isError ? projectError(create.error) : "")
              }
              onPlan={(input) => {
                if (!canLeave()) return;
                const parsed = planRequestSchema.safeParse(input);
                if (!parsed.success) {
                  setInputError(projectError(parsed.error));
                  return;
                }
                setInputError("");
                setNotice("");
                create.mutate(parsed.data);
              }}
            />
            <WindowPanel title="Recent projects" accent="purple">
              <div className="p-4">
                {projects.isPending && (
                  <p role="status" className="p-2 text-xs text-ink-muted">
                    Loading your projects…
                  </p>
                )}
                {projects.isError && (
                  <div role="alert" className="space-y-2 p-2 text-xs">
                    <p>{projectError(projects.error)}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void projects.refetch();
                      }}
                    >
                      <RefreshCw className="size-3" />
                      Reload projects
                    </Button>
                    <Link
                      href="/sign-in"
                      className="block underline underline-offset-4"
                    >
                      Sign in again
                    </Link>
                  </div>
                )}
                {projects.data?.projects.length === 0 && (
                  <p className="p-2 text-xs leading-relaxed text-ink-muted">
                    Your first outline starts above. Saved projects will appear
                    here.
                  </p>
                )}
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                  {projects.data?.projects.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => selectProject(item.id)}
                        disabled={create.isPending || retry.isPending}
                        aria-current={
                          activeProjectId === item.id ? "true" : undefined
                        }
                        className={`flex w-full items-start gap-3 border px-3 py-3 text-left transition-colors disabled:opacity-50 ${activeProjectId === item.id ? "border-ink bg-purple-soft" : "border-transparent hover:bg-paper"}`}
                      >
                        <FolderOpen className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {item.title}
                          </span>
                          <span
                            className={`mt-1 block text-[11px] ${item.status === "failed" ? "text-destructive" : "text-ink-muted"}`}
                          >
                            {statusLabels[item.status]}
                          </span>
                        </span>
                        {item.status === "planning" && (
                          <LoaderCircle className="mt-1 size-3.5 shrink-0 animate-spin" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
                {(projects.data?.projects.length ?? 0) >= 40 && (
                  <p className="mt-3 text-[11px] text-ink-muted">
                    Showing your 40 most recently updated projects.
                  </p>
                )}
              </div>
            </WindowPanel>
          </div>
          <div className="space-y-4">
            {notice && (
              <p
                role="status"
                className="border border-border bg-green-soft p-3 text-sm"
              >
                {notice}
              </p>
            )}
            {!activeProjectId && <PlanningEmpty />}
            {activeProjectId && detail.isPending && (
              <WindowPanel title="Opening your project" accent="green">
                <p
                  role="status"
                  className="flex items-center gap-3 p-8 text-sm text-ink-muted"
                >
                  <LoaderCircle className="size-4 animate-spin" />
                  Loading the saved outline…
                </p>
              </WindowPanel>
            )}
            {detail.isError && activeProjectId && (
              <div
                role="alert"
                className="space-y-3 border border-ink bg-[var(--red-soft)] p-4 text-sm"
              >
                <p>{projectError(detail.error)}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void detail.refetch();
                  }}
                >
                  Try loading again
                </Button>
              </div>
            )}
            {detail.data && activeProjectId && (
              <PlanningResult
                key={detail.data.project.id}
                detail={detail.data}
                pending={retry.isPending}
                error={retry.isError ? projectError(retry.error) : ""}
                onContinue={(answer) => {
                  const current = detail.data;
                  if (current) retry.mutate({ id: current.project.id, answer });
                }}
                onSaved={saved}
                onDirty={setDirty}
                onReload={() => {
                  if (canLeave()) {
                    setDirty(false);
                    void detail.refetch();
                  }
                }}
              />
            )}
          </div>
        </div>
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-ink-muted">
          <span>Drishya · A clearer way to learn.</span>
          <span>
            Outline first. Open a saved chapter to shape its script and visuals.
          </span>
        </footer>
      </main>
    </div>
  );
}
