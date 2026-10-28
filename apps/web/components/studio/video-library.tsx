"use client";
import { VideoFeatures } from "./video-features";
import type { VideoLibrary } from "@drishya/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Play,
  Search,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { chat, videoLibrary } from "@/lib/explanations";
import { projectError } from "@/lib/projects";
import { ChoiceSelect } from "./choice-select";
import { StudioShell } from "./shell";
import { StudioVideo } from "./studio-video";
import { VideoResult } from "./video-result";
export function VideoLibraryView({ userId }: { userId: string }) {
  const [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<VideoLibrary["items"][number] | null>(
      null,
    );
  const dialog = useRef<HTMLDialogElement>(null);
  const result = useQuery({
    queryKey: ["video-library", userId, offset],
    queryFn: () => videoLibrary(offset),
    refetchInterval: 10_000,
  });
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const visible = result.data?.items.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <StudioShell userId={userId} library>
      <div className="v2-library">
        <div className="v2-library-top">
          <div>
            <h1>Your videos.</h1>
            <p>Finished explanations, ready when you need them.</p>
          </div>
          <Link className="v2-button v2-button-primary" href="/workspace">
            Create a video
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <label className="v2-library-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a video on this page"
            aria-label="Find a video"
          />
        </label>
        {result.isPending && (
          <div className="v2-library-skeleton">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} />
            ))}
          </div>
        )}
        {result.isError && (
          <div className="v2-question-card">
            <p>{projectError(result.error)}</p>
            <button
              type="button"
              className="v2-button"
              onClick={() => {
                void result.refetch();
              }}
            >
              Reload videos
            </button>
          </div>
        )}
        {visible && !visible.length && (
          <div className="v2-library-empty">
            <span>
              <Video size={28} />
            </span>
            <h2>Your first video starts with an idea.</h2>
            <p>
              Finished videos and chapter collections will be saved here
              automatically.
            </p>
            <Link className="v2-button" href="/workspace">
              Start a conversation
              <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <div className="v2-video-grid">
          {visible?.map((item) => (
            <article key={item.id} className="v2-library-card">
              {item.conversationId ? (
                <Link
                  className="v2-library-cover"
                  href={`/workspace/library/${item.conversationId}?revision=${item.revisionId}`}
                  aria-label={`Play ${item.title}`}
                >
                  {item.posterUrl ? (
                    <img src={item.posterUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="v2-legacy-poster">
                      <Video size={36} />
                    </span>
                  )}
                  <span className="v2-play-cover">
                    <Play size={22} fill="currentColor" />
                  </span>
                  {item.kind === "collection" ? (
                    <span className="v2-cover-badge">
                      <FolderOpen size={12} />
                      {item.parts.length} chapters
                    </span>
                  ) : (
                    <span className="v2-cover-badge">
                      {item.duration
                        ? `${Math.floor(item.duration / 60)}:${String(Math.round(item.duration % 60)).padStart(2, "0")}`
                        : "Video"}
                    </span>
                  )}
                </Link>
              ) : (
                <button
                  type="button"
                  className="v2-library-cover"
                  aria-label={`Play ${item.title}`}
                  onClick={() => setSelected(item)}
                >
                  <span className="v2-legacy-poster">
                    <Video size={36} />
                    <small>From your earlier studio</small>
                  </span>
                  <span className="v2-play-cover">
                    <Play size={22} fill="currentColor" />
                  </span>
                </button>
              )}
              <div className="v2-library-card-title">
                <h2>{item.title}</h2>
                <p>
                  {new Date(item.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {item.kind === "collection" ? " · Chapter collection" : ""}
                </p>
              </div>
            </article>
          ))}
        </div>
        {(offset > 0 || result.data?.hasMore) && (
          <div className="v2-pagination">
            <button
              type="button"
              className="v2-button"
              disabled={!offset || result.isFetching}
              onClick={() => setOffset(Math.max(0, offset - 40))}
            >
              <ChevronLeft size={15} />
              Previous
            </button>
            <span>Page {offset / 40 + 1}</span>
            <button
              type="button"
              className="v2-button"
              disabled={!result.data?.hasMore || result.isFetching}
              onClick={() => setOffset(offset + 40)}
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        )}
        <dialog
          ref={dialog}
          className="v2-video-dialog"
          onCancel={() => setSelected(null)}
        >
          {selected && (
            <>
              <div className="v2-dialog-heading">
                <h2>{selected.title}</h2>
                <button
                  type="button"
                  className="v2-icon-button"
                  onClick={() => setSelected(null)}
                  aria-label="Close video"
                >
                  ×
                </button>
              </div>
              <StudioVideo
                controls
                autoPlay
                preload="metadata"
                src={selected.videoUrl ?? undefined}
              >
                <track
                  kind="captions"
                  src={selected.captionsUrl ?? undefined}
                  label="Narration"
                />
              </StudioVideo>
              <div className="v2-download-row">
                <a
                  className="v2-button v2-button-primary"
                  href={`${selected.videoUrl}?download=1`}
                >
                  <Download size={15} />
                  Download video
                </a>
                <span>Preserved from your earlier studio</span>
              </div>
            </>
          )}
        </dialog>
      </div>
    </StudioShell>
  );
}
export function LibraryVideoPage({
  userId,
  chatId,
  revisionId,
}: {
  userId: string;
  chatId: string;
  revisionId?: string;
}) {
  const result = useQuery({
    queryKey: ["chat", userId, chatId],
    queryFn: () => chat(chatId),
    refetchInterval: (query) =>
      query.state.data?.revisions.some((row) =>
        ["generating", "narrating", "rendering", "queued", "planning"].includes(
          row.status,
        ),
      )
        ? 2000
        : false,
  });
  const roots =
    result.data?.revisions.filter(
      (row) =>
        !row.collectionId &&
        ["ready", "partial", "generating"].includes(row.status),
    ) ?? [];
  const selected = roots.find((row) => row.id === revisionId) ?? roots.at(-1);
  const [versionId, setVersionId] = useState<string | undefined>(revisionId);
  const current = roots.find((row) => row.id === versionId) ?? selected;
  return (
    <StudioShell userId={userId} library title={current?.title ?? "Your video"}>
      <div className="v2-library-watch">
        <Link className="v2-text-button" href="/workspace/library">
          <ArrowLeft size={15} />
          Back to library
        </Link>
        {result.isError && (
          <div className="v2-error">
            {projectError(result.error)}
            <button
              type="button"
              className="v2-button"
              onClick={() => {
                void result.refetch();
              }}
            >
              Retry
            </button>
          </div>
        )}
        {result.isPending && <p>Opening your video…</p>}
        {current && (
          <>
            <div className="v2-watch-title">
              <div>
                <h1>{current.title}</h1>
                <p>
                  {current.outline.length
                    ? `${current.outline.length} chapters`
                    : `${current.duration?.toFixed(0) ?? ""} seconds`}{" "}
                  · {current.settings.language.toUpperCase()}
                </p>
              </div>
              <Link className="v2-button" href={`/workspace/chat/${chatId}`}>
                Open chat
                <ArrowUpRight size={15} />
              </Link>
            </div>
            {roots.length > 1 && (
              <label className="v2-watch-version" htmlFor="library-version">
                Version
                <ChoiceSelect
                  id="library-version"
                  label="Video version"
                  value={current.id}
                  onChange={setVersionId}
                  options={roots.map((row) => ({
                    value: row.id,
                    label: `Version ${row.version} · ${new Date(row.createdAt).toLocaleDateString()}`,
                  }))}
                />
              </label>
            )}
            <VideoResult
              key={current.id}
              revision={current}
              allRevisions={result.data?.revisions}
              parts={result.data?.revisions.filter(
                (row) => row.collectionId === current.id,
              )}
            />
            {current.status === "ready" && (
              <VideoFeatures
                key={current.id}
                revisionId={current.id}
                initialLanguage={current.settings.language}
                initialVoice={current.settings.voice}
              />
            )}
          </>
        )}
      </div>
    </StudioShell>
  );
}
