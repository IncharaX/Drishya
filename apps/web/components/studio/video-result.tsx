"use client";
import { FeedbackCard } from "./feedback";
import { type ExplanationRevision, planFrames } from "@drishya/contracts";
import { ExplanationComposition } from "@drishya/motion";
import { Tooltip } from "@drishya/ui/components/tooltip";
import { Player, type PlayerRef } from "@remotion/player";
import {
  Check,
  Clock3,
  Download,
  ExternalLink,
  Info,
  LoaderCircle,
  Play,
  RefreshCw,
  Square,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { explanationAudio, explanationFile as originalExplanationFile } from "@/lib/explanations";
import { StudioVideo } from "./studio-video";

export function VideoResult({
  revision,
  parts = [],
  allRevisions = [],
  onCancel,
  onRetry,
  onTimestamp,
}: {
  revision: ExplanationRevision;
  parts?: ExplanationRevision[];
  allRevisions?: ExplanationRevision[];
  onCancel?: () => void;
  onRetry?: (id?: string) => void;
  onTimestamp?: (time: number, revisionId?: string) => void;
}) {
  // Repairs replace media within a revision; give the browser a new URL.
  const explanationFile = (...args: Parameters<typeof originalExplanationFile>) => {
    const url = originalExplanationFile(...args);
    return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(revision.updatedAt ?? revision.createdAt)}`;
  };
  const player = useRef<PlayerRef>(null),
    video = useRef<HTMLVideoElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [playerError, setPlayerError] = useState("");
  const selected =
    parts.find((part) => part.id === selectedId) ??
    parts.find((part) => part.status === "ready");
  if (parts.length)
    return (
      <div className="v2-collection-result">
        <div className="v2-result-heading">
          <div>
            <h3>{revision.title}</h3>
            <p>
              {parts.filter((part) => part.status === "ready").length} of{" "}
              {parts.length} chapters ready
            </p>
          </div>
          {onCancel &&
            parts.some((part) =>
              [
                "queued",
                "planning",
                "generating",
                "narrating",
                "rendering",
              ].includes(part.status),
            ) && (
              <button
                type="button"
                className="v2-text-button"
                onClick={onCancel}
              >
                Stop generation
              </button>
            )}
          <Link
            className="v2-text-button"
            href={`/workspace/library/${revision.conversationId}?revision=${revision.id}`}
          >
            Open collection
            <ExternalLink size={14} />
          </Link>
        </div>
        {selected && (
          <VideoResult
            key={selected.id}
            revision={selected}
            parts={allRevisions.filter(
              (part) => part.collectionId === selected.id,
            )}
            allRevisions={allRevisions}
            onTimestamp={onTimestamp}
            onRetry={onRetry}
          />
        )}
        <div className="v2-chapter-list">
          {parts.map((part, i) => (
            <button
              type="button"
              key={part.id}
              className={selected?.id === part.id ? "is-selected" : ""}
              disabled={
                part.status !== "ready" &&
                part.status !== "failed" &&
                part.status !== "cancelled"
              }
              onClick={() => {
                if (part.status === "failed" || part.status === "cancelled")
                  onRetry?.(part.id);
                else setSelectedId(part.id);
              }}
            >
              <span className="v2-part-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                {part.title}
                <small>
                  {part.status === "ready"
                    ? `${part.duration?.toFixed(0)} seconds`
                    : part.stage}
                </small>
              </span>
              {part.status === "ready" ? (
                <Play size={15} />
              ) : part.status === "failed" || part.status === "cancelled" ? (
                <span>Retry</span>
              ) : (
                <LoaderCircle size={15} className="v2-spin" />
              )}
            </button>
          ))}
        </div>
        {revision.status === "partial" && (
          <p className="v2-error">
            Some chapters need attention. Completed chapters remain playable.
          </p>
        )}
      </div>
    );
  const ready = revision.status === "ready",
    failed = revision.status === "failed" || revision.status === "cancelled",
    preview =
      revision.status === "rendering" &&
      revision.plan?.beats.every(
        (beat) => beat.audioKey && beat.durationInFrames,
      );
  if (
    revision.status === "awaiting_approval" ||
    revision.status === "awaiting_input"
  )
    return null;
  const source = explanationFile(
    revision.conversationId,
    revision.id,
    "video.mp4",
  );
  return (
    <div className={`v2-video-result ${ready ? "is-ready" : ""}`}>
      {ready ? (
        <>
          <div className="v2-result-heading">
            <div className="v2-ready-label">
              <Check size={14} />
              Your video is ready
            </div>
            <span>
              {revision.duration?.toFixed(0)}s ·{" "}
              {revision.timings.exportHeight ?? 1080}p ·{" "}
              {revision.settings.language.toUpperCase()}
            </span>
          </div>
          <StudioVideo
            ref={video}
            className="v2-finished-video"
            controls
            preload="metadata"
            poster={explanationFile(
              revision.conversationId,
              revision.id,
              "poster.jpg",
            )}
            src={source}
            onError={() =>
              setPlayerError(
                "The video couldn’t load. Reload the page or retry this version.",
              )
            }
          >
            <track
              kind="captions"
              label="Narration"
              srcLang={revision.settings.language}
              src={explanationFile(
                revision.conversationId,
                revision.id,
                "captions.vtt",
              )}
            />
          </StudioVideo>
          <div className="v2-download-row">
            <a
              className="v2-button v2-button-primary"
              href={explanationFile(
                revision.conversationId,
                revision.id,
                "video.mp4",
                true,
              )}
            >
              <Download size={15} />
              Download video
            </a>
            <a
              className="v2-text-button"
              href={explanationFile(
                revision.conversationId,
                revision.id,
                "captions.srt",
                true,
              )}
            >
              Captions
            </a>
            {onTimestamp && (
              <Tooltip content="Use the current playback time to target your next edit.">
                <button
                  type="button"
                  className="v2-text-button"
                  onClick={() =>
                    onTimestamp(video.current?.currentTime ?? 0, revision.id)
                  }
                >
                  Edit this moment
                </button>
              </Tooltip>
            )}
            <span className="v2-saved-note">Saved to library</span>
          </div>
          <FeedbackCard key={revision.id} revisionId={revision.id} />
        </>
      ) : failed ? (
        <div className="v2-generation-failed">
          <Video size={24} />
          <h3>
            {revision.status === "cancelled"
              ? "Generation stopped"
              : "This video needs attention"}
          </h3>
          <p>
            {revision.errorMessage ??
              "Your chat and previous versions are saved."}
          </p>
          {onRetry && (
            <button
              type="button"
              className="v2-button"
              onClick={() => onRetry?.(revision.id)}
            >
              <RefreshCw size={14} />
              Retry this version
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="v2-progress-top">
            <span className="v2-progress-orb">
              <Video size={20} />
            </span>
            <div>
              <h3>{revision.stage}</h3>
              <p>
                {preview
                  ? "You can watch the preview while the download renders."
                  : "You can leave this chat. I’ll keep working and save the result here."}
              </p>
            </div>
            {onCancel && (
              <button
                type="button"
                className="v2-icon-button"
                aria-label="Cancel generation"
                title="Cancel generation"
                onClick={onCancel}
              >
                <Square size={15} />
              </button>
            )}
          </div>
          {revision.estimate && (
            <div className="v2-generation-eta">
              <Clock3 size={14} />
              <span>
                Estimated remaining:{" "}
                {revision.estimate.highSeconds < 60
                  ? `${revision.estimate.lowSeconds}–${revision.estimate.highSeconds} sec`
                  : `${Math.max(1, Math.round(revision.estimate.lowSeconds / 60))}–${Math.max(1, Math.ceil(revision.estimate.highSeconds / 60))} min`}
              </span>
              {revision.estimate.queueAhead > 0 && (
                <span className="v2-eta-detail">
                  · {revision.estimate.queueAhead} job
                  {revision.estimate.queueAhead === 1 ? "" : "s"} ahead
                </span>
              )}
              <Tooltip
                content={
                  revision.estimate.basis === "history"
                    ? "An approximate range based on your previous local generations. It updates as stages complete."
                    : "Initial estimate for local inference, not a deadline. It becomes more accurate after completed generations."
                }
              >
                <button
                  type="button"
                  className="v2-icon-button"
                  aria-label="About generation estimate"
                >
                  <Info size={14} />
                </button>
              </Tooltip>
            </div>
          )}
          <div className="v2-stage-track">
            {["Plan", "Narrate", "Animate", "Finish"].map((name, i) => {
              const n = revision.progress;
              const passed = n >= [15, 35, 65, 98][i];
              return (
                <span key={name} className={passed ? "is-done" : ""}>
                  {passed ? (
                    <Check size={12} />
                  ) : (
                    <span className="v2-stage-dot" />
                  )}
                  {name}
                </span>
              );
            })}
          </div>
          <div className="v2-progress-line">
            <span style={{ width: `${Math.max(3, revision.progress)}%` }} />
          </div>
          {preview && revision.plan && (
            <div className="v2-live-preview">
              <Player
                ref={player}
                component={ExplanationComposition}
                inputProps={{
                  plan: revision.plan,
                  bedAudioSource:
                    revision.plan.sound.mood !== "none"
                      ? explanationAudio(
                          revision.conversationId,
                          revision.id,
                          "soundtrack",
                        )
                      : undefined,
                  audioSources: Object.fromEntries(
                    revision.plan.beats.map((beat) => [
                      beat.id,
                      explanationAudio(
                        revision.conversationId,
                        revision.id,
                        beat.id,
                      ),
                    ]),
                  ),
                }}
                durationInFrames={planFrames(revision.plan)}
                compositionWidth={1280}
                compositionHeight={720}
                fps={30}
                controls
                style={{ width: "100%", aspectRatio: "16/9" }}
                errorFallback={() => (
                  <div className="v2-preview-error">
                    Preview is unavailable. The final render will still appear
                    here.
                  </div>
                )}
              />
              <span>Animated preview · download rendering</span>
            </div>
          )}
        </>
      )}
      {playerError && (
        <p role="alert" className="v2-error">
          {playerError}
        </p>
      )}
    </div>
  );
}
