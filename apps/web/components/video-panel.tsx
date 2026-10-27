"use client";
import {
  buildTimeline,
  type LessonDetail,
  type Voiceover,
} from "@drishya/contracts";
import { Button } from "@drishya/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Download, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { projectError } from "@/lib/projects";
import {
  createVideo,
  fitNarration,
  listVideos,
  videoFileUrl,
} from "@/lib/videos";
import { sceneAudioUrl } from "@/lib/voiceovers";
import { ChapterPlayer } from "./chapter-player";

export function VideoPanel({
  userId,
  projectId,
  chapterId,
  lesson,
  take,
  locked,
  onTake,
}: {
  userId: string;
  projectId: string;
  chapterId: string;
  lesson: LessonDetail;
  take: Voiceover;
  locked: boolean;
  onTake: (take: Voiceover) => void;
}) {
  const client = useQueryClient();
  const key = [
    "video-exports",
    userId,
    projectId,
    chapterId,
    lesson.id,
    take.id,
  ];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const exports = useQuery({
    queryKey: key,
    queryFn: () => listVideos(projectId, chapterId, lesson.id, take.id),
    refetchInterval: (query) =>
      query.state.data?.exports.some(
        (record) =>
          record.status === "preparing" || record.status === "rendering",
      )
        ? 2000
        : false,
  });
  const busy =
    exports.data?.exports.some(
      (record) =>
        record.status === "preparing" || record.status === "rendering",
    ) ?? false;
  const selected = exports.data?.exports.find(
    (record) => record.id === (selectedId ?? exports.data.exports[0]?.id),
  );
  const create = useMutation({
    mutationFn: () => createVideo(projectId, chapterId, lesson.id, take.id),
    onSuccess: (record) => {
      setSelectedId(record.id);
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const fit = useMutation({
    mutationFn: () => fitNarration(projectId, chapterId, lesson.id, take.id),
    onSuccess: onTake,
  });
  const { timeline, error } = useMemo(() => {
    try {
      if (!take.content)
        throw new Error("Generate a complete narration take first.");
      return {
        timeline: buildTimeline(
          take.content,
          take.audio,
          lesson.input.request.targetDurationSeconds,
        ),
        error: "",
      };
    } catch (issue) {
      return {
        timeline: null,
        error:
          issue instanceof Error
            ? issue.message
            : "Generate a complete narration take first.",
      };
    }
  }, [take.content, take.audio, lesson.input.request.targetDurationSeconds]);
  const url = (
    file: "video.mp4" | "captions.vtt" | "captions.srt" | "manifest.json",
    download = false,
  ) =>
    videoFileUrl(
      projectId,
      chapterId,
      lesson.id,
      take.id,
      selected?.id ?? "",
      file,
      download,
    );
  return (
    <section
      className="space-y-5 border-t border-border pt-5"
      aria-label="Chapter video"
    >
      <div className="flex items-start gap-3">
        <Clapperboard className="mt-1 size-5" />
        <div>
          <h3 className="font-display text-3xl">Bring it together.</h3>
          <p className="mt-2 text-sm text-ink-muted">
            Preview the narrated chapter, then export a 720p video with
            captions.
          </p>
        </div>
      </div>
      {timeline && (
        <ChapterPlayer
          key={take.id}
          take={take}
          timeline={timeline}
          audioUrl={(sceneId) =>
            sceneAudioUrl(projectId, chapterId, lesson.id, take.id, sceneId)
          }
        />
      )}
      {error && (
        <div className="space-y-3 bg-yellow-soft p-4 text-sm">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={locked || fit.isPending || busy}
            onClick={() => fit.mutate()}
          >
            {fit.isPending && <LoaderCircle className="size-4 animate-spin" />}
            Shorten narration to fit
          </Button>
          <p className="text-xs text-ink-muted">
            Creates a new take with at most two shortening and synthesis
            attempts. Review its wording before export. If it still cannot fit,
            split the chapter into smaller learning objectives.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={
            !timeline ||
            locked ||
            busy ||
            create.isPending ||
            fit.isPending ||
            exports.isPending ||
            exports.isError
          }
          onClick={() => create.mutate()}
        >
          {busy || create.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Clapperboard className="size-4" />
          )}
          {busy ? "Rendering video…" : "Export MP4"}
        </Button>
        <span className="text-xs text-ink-muted">
          H.264 · AAC · 1280 × 720 · 24 fps · local rendering
        </span>
      </div>
      {[create.error, fit.error, exports.error].filter(Boolean).map((issue) => (
        <p
          key={String(issue)}
          role="alert"
          className="bg-[var(--red-soft)] p-3 text-sm"
        >
          {projectError(issue)}
        </p>
      ))}
      {exports.isError && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void exports.refetch();
          }}
        >
          Reload video exports
        </Button>
      )}
      {!!exports.data?.exports.length && (
        <label className="block space-y-2 text-xs">
          <span className="field-label">Saved video exports</span>
          <select
            className="h-10 w-full border-[1.5px] border-ink bg-card px-3 text-sm"
            value={selected?.id ?? ""}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {exports.data.exports.map((record) => (
              <option key={record.id} value={record.id}>
                {record.status} · {record.id.slice(0, 8)} ·{" "}
                {new Date(record.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected &&
        (selected.status === "preparing" ||
          selected.status === "rendering") && (
          <div role="status" className="space-y-2 bg-purple-soft p-4 text-sm">
            <p>
              {selected.status === "preparing"
                ? "Measuring scene audio…"
                : `Rendering and encoding… ${selected.progress}%`}
            </p>
            <progress className="w-full" value={selected.progress} max={100} />
          </div>
        )}
      {selected?.status === "failed" && (
        <p role="alert" className="bg-[var(--red-soft)] p-4 text-sm">
          {selected.errorMessage}
        </p>
      )}
      {selected?.status === "ready" && (
        <div className="space-y-3">
          <video
            key={selected.id}
            controls
            preload="metadata"
            className="aspect-video w-full border border-ink"
            src={url("video.mp4")}
          >
            <track
              kind="captions"
              src={url("captions.vtt")}
              srcLang={take.language}
              label="Narration"
            />
            Your browser does not support video playback.
          </video>
          <div className="flex flex-wrap gap-4 text-sm">
            {(["video.mp4", "captions.vtt", "captions.srt"] as const).map(
              (file) => (
                <a
                  key={file}
                  className="inline-flex items-center gap-2 underline"
                  href={url(file, true)}
                >
                  <Download className="size-3.5" />
                  {file === "video.mp4"
                    ? "Download MP4"
                    : file.endsWith("vtt")
                      ? "VTT captions"
                      : "SRT captions"}
                </a>
              ),
            )}
          </div>
        </div>
      )}
    </section>
  );
}
