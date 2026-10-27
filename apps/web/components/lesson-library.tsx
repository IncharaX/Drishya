"use client";
import { Button } from "@drishya/ui/components/button";
import { Input } from "@drishya/ui/components/input";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { loadLibrary } from "@/lib/jobs";
import { projectError } from "@/lib/projects";
import { videoFileUrl } from "@/lib/videos";
import { AccountMenu } from "./account-menu";
import { Brand } from "./brand";
import { GenerationJobs } from "./generation-jobs";
export function LessonLibrary({ userId }: { userId: string }) {
  const client = useQueryClient();
  const [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [language, setLanguage] = useState("all");
  const library = useQuery({
    queryKey: ["library", userId, offset],
    queryFn: () => loadLibrary(offset),
    refetchInterval: 10_000,
  });
  const visible = library.data?.items.filter(
    (item) =>
      (language === "all" || item.language === language) &&
      `${item.projectTitle} ${item.chapterTitle} ${item.voiceLabel ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="min-h-dvh bg-paper">
      <header className="flex flex-wrap items-center gap-4 border-b-[1.5px] border-ink px-5 py-3.5 sm:px-8">
        <Brand />
        <Link href="/workspace" className="text-sm underline">
          Back to studio
        </Link>
        <div className="ml-auto">
          <AccountMenu onSignOut={() => client.clear()} />
        </div>
      </header>
      <main className="mx-auto max-w-[1320px] space-y-7 px-5 py-10 sm:px-8">
        <div>
          <p className="field-label mb-3">Your teaching shelf</p>
          <h1 className="font-display text-5xl">Saved lessons.</h1>
          <p className="mt-4 max-w-[70ch] text-sm text-ink-muted">
            Browse chapter versions, narration languages and video exports.
            Saved versions stay available as you refine the lesson.
          </p>
        </div>
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
          <WindowPanel title="Lesson library" accent="purple">
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-3">
                <Input
                  aria-label="Search this library page"
                  placeholder="Search projects or chapters on this page"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="min-w-48 flex-1"
                />
                <select
                  aria-label="Filter by narration language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="border-[1.5px] border-ink bg-card px-3 text-sm"
                >
                  {Object.entries({
                    all: "All languages",
                    en: "English",
                    hi: "Hindi",
                    kn: "Kannada",
                    te: "Telugu",
                    mr: "Marathi (legacy)",
                  }).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {library.isPending && (
                <p role="status" className="text-sm">
                  Loading saved lessons…
                </p>
              )}
              {library.isError && (
                <div
                  role="alert"
                  className="space-y-2 bg-[var(--red-soft)] p-3 text-sm"
                >
                  <p>{projectError(library.error)}</p>
                  <Button
                    size="sm"
                    onClick={() => {
                      void library.refetch();
                    }}
                  >
                    Reload library
                  </Button>
                </div>
              )}
              {library.data && !visible?.length && (
                <div className="space-y-3 py-8 text-sm">
                  <p>
                    No matching lessons on this page. Create a storyboard in the
                    studio or explore the labelled example.
                  </p>
                  <Link href="/workspace/example" className="underline">
                    Open built-in example
                  </Link>
                </div>
              )}
              <ul className="space-y-4">
                {visible?.map((item) => (
                  <li
                    key={item.id}
                    className="space-y-3 border border-ink bg-card p-4"
                  >
                    <div>
                      <p className="field-label text-[10px]">
                        {item.projectTitle} · version {item.version}
                      </p>
                      <h2 className="mt-2 font-display text-2xl">
                        {item.chapterTitle}
                      </h2>
                      <p className="mt-2 text-xs text-ink-muted">
                        {item.language?.toUpperCase() ?? "English storyboard"} ·{" "}
                        {item.voiceLabel ?? "No narration yet"} ·{" "}
                        {item.exportStatus
                          ? `Video ${item.exportStatus}`
                          : item.narrationStatus
                            ? `Narration ${item.narrationStatus}`
                            : `Storyboard ${item.storyboardStatus}`}
                        {item.duration ? ` · ${item.duration.toFixed(1)}s` : ""}
                      </p>
                      <p className="mt-1 text-[10px] text-ink-muted">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <Link
                        className="underline"
                        href={`/workspace/${item.projectId}/chapters/${item.chapterId}?versionId=${item.versionId}${item.takeId ? `&takeId=${item.takeId}` : ""}`}
                      >
                        Open saved version
                      </Link>
                      {item.exportId &&
                        item.takeId &&
                        item.exportStatus === "ready" &&
                        (
                          ["video.mp4", "captions.vtt", "captions.srt"] as const
                        ).map((file) => (
                          <a
                            key={file}
                            className="underline"
                            href={videoFileUrl(
                              item.projectId,
                              item.chapterId,
                              item.versionId,
                              item.takeId ?? "",
                              item.exportId ?? "",
                              file,
                              true,
                            )}
                          >
                            {file === "video.mp4"
                              ? "Download MP4"
                              : file.endsWith("vtt")
                                ? "VTT"
                                : "SRT"}
                          </a>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!offset || library.isFetching}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  Previous
                </Button>
                <span className="text-xs text-ink-muted">
                  Page {offset / 50 + 1}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!library.data?.hasMore || library.isFetching}
                  onClick={() => setOffset(offset + 50)}
                >
                  Next
                </Button>
              </div>
            </div>
          </WindowPanel>
          <GenerationJobs userId={userId} />
        </div>
      </main>
    </div>
  );
}
