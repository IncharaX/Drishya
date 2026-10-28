"use client";
import { Button } from "@drishya/ui/components/button";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cancelJob, listJobs, retryJob } from "@/lib/jobs";
import { projectError } from "@/lib/projects";

const names = {
  learning:"Q&A and quiz",
  explanation: "Video explanation",
  plan: "Topic outline",
  storyboard: "Storyboard",
  voiceover: "Narration",
  video: "Video export",
};
export function GenerationJobs({
  userId,
  projectId,
}: {
  userId: string;
  projectId?: string;
}) {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const key = ["generation-jobs", userId, projectId ?? "all"];
  const jobs = useQuery({
    queryKey: key,
    queryFn: () => listJobs(projectId),
    refetchInterval: 3000,
  });
  const previous = useRef("");
  const signature =
    jobs.data?.jobs.map((job) => `${job.id}:${job.status}`).join("|") ?? "";
  useEffect(() => {
    if (previous.current && previous.current !== signature) {
      for (const name of [
        "projects",
        "project",
        "storyboards",
        "storyboard",
        "voiceovers",
        "video-exports",
        "library",
      ])
        void client.invalidateQueries({ queryKey: [name, userId] });
    }
    previous.current = signature;
  }, [signature, client, userId]);
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: key });
  };
  const cancel = useMutation({ mutationFn: cancelJob, onSuccess: invalidate });
  const retry = useMutation({ mutationFn: retryJob, onSuccess: invalidate });
  const visible = (jobs.data?.jobs ?? []).filter(
    (job, i) =>
      expanded ||
      ["queued", "running", "retrying"].includes(job.status) ||
      i < 4,
  );
  return (
    <WindowPanel title="Generation activity" accent="green">
      <div className="space-y-3 p-4 sm:p-5">
        {jobs.data && !jobs.data.workerOnline && (
          <p role="status" className="bg-yellow-soft p-3 text-xs">
            The generation worker is offline. New jobs stay queued and will
            resume when it reconnects.
          </p>
        )}
        {jobs.isPending && (
          <p className="text-xs" role="status">
            Loading saved jobs…
          </p>
        )}
        {[jobs.error, cancel.error, retry.error]
          .filter(Boolean)
          .map((error) => (
            <p
              key={String(error)}
              role="alert"
              className="bg-[var(--red-soft)] p-3 text-xs"
            >
              {projectError(error)}
            </p>
          ))}
        {jobs.isError && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void jobs.refetch();
            }}
          >
            Reload activity
          </Button>
        )}
        {jobs.data && !visible.length && (
          <p className="text-xs text-ink-muted">
            Generation stages, progress and retries appear here. You can leave
            the studio while the worker runs.
          </p>
        )}
        <ul className="space-y-3">
          {visible.map((job) => {
            const active = ["queued", "running", "retrying"].includes(
              job.status,
            );
            return (
              <li key={job.id} className="space-y-2 border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{names[job.kind]}</span>
                  <span className="font-mono text-[10px] uppercase">
                    {job.status} · attempt {job.attempts}/{job.maxAttempts}
                  </span>
                </div>
                <p className="flex items-center gap-2 text-xs text-ink-muted">
                  {active && <LoaderCircle className="size-3 animate-spin" />}
                  {job.cancelRequested && active
                    ? "Stopping generation…"
                    : job.stage}
                </p>
                {job.status === "running" && (
                  <progress
                    aria-label={`${names[job.kind]} progress`}
                    className="h-1.5 w-full"
                    max={100}
                    value={job.progress}
                  />
                )}
                {job.errorMessage && (
                  <p className="text-xs text-ink-muted">{job.errorMessage}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {active && !job.cancelRequested && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(job.id)}
                    >
                      Cancel
                    </Button>
                  )}
                  {["failed", "cancelled"].includes(job.status) &&
                    job.attempts < job.maxAttempts && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(job.id)}
                      >
                        Retry saved job
                      </Button>
                    )}
                  {job.status === "failed" && (
                    <Link
                      href="/workspace/example"
                      className="self-center text-xs underline"
                    >
                      Open built-in example
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {(jobs.data?.jobs.length ?? 0) > 4 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show recent activity" : "Show job history"}
          </Button>
        )}
      </div>
    </WindowPanel>
  );
}
