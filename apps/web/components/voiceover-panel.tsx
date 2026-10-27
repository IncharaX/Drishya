"use client";

import {
  type LessonDetail,
  type LocalizedStoryboard,
  localizationIssues,
  localizedStoryboardSchema,
  narrationLanguageSchema,
  type Voiceover,
} from "@drishya/contracts";
import { SceneCanvas } from "@drishya/renderer";
import { Button } from "@drishya/ui/components/button";
import { Input } from "@drishya/ui/components/input";
import { Label } from "@drishya/ui/components/label";
import { Textarea } from "@drishya/ui/components/textarea";
import { WindowPanel } from "@drishya/ui/components/window-panel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Languages, LoaderCircle, RefreshCw, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { projectError } from "@/lib/projects";
import {
  createVoiceover,
  listVoiceovers,
  listVoices,
  reviseVoiceover,
  sceneAudioUrl,
} from "@/lib/voiceovers";

import { VideoPanel } from "./video-panel";

const languages = {
  en: "English",
  hi: "Hindi · हिन्दी",
  kn: "Kannada · ಕನ್ನಡ",
  te: "Telugu · తెలుగు",
  mr: "Marathi (legacy)",
};
const selectClass =
  "h-10 w-full border-[1.5px] border-ink bg-card px-3 text-sm disabled:opacity-50";

export function VoiceoverPanel({
  userId,
  projectId,
  chapterId,
  lesson,
  sourceDirty,
  initialTakeId,
  onDirty,
}: {
  userId: string;
  projectId: string;
  chapterId: string;
  lesson: LessonDetail;
  initialTakeId?: string;
  sourceDirty: boolean;
  onDirty: (value: boolean) => void;
}) {
  const client = useQueryClient();
  const [language, setLanguage] = useState<"en" | "hi" | "kn" | "te">(
    narrationLanguageSchema.safeParse(lesson.input.request.language).data ??
      "en",
  );
  const [voiceId, setVoiceId] = useState("");
  const speed = 1 as const;
  const [takeId, setTakeId] = useState<string | null>(initialTakeId ?? null);
  const [dirty, setDirty] = useState(false);
  const voices = useQuery({
    queryKey: ["speech-voices", "indic-parler-v1", userId],
    queryFn: listVoices,
    retry: false,
  });
  const key = ["voiceovers", userId, projectId, chapterId, lesson.id];
  const takes = useQuery({
    queryKey: key,
    queryFn: () => listVoiceovers(projectId, chapterId, lesson.id),
    refetchInterval: (query) =>
      query.state.data?.takes.some(
        (item) =>
          item.status === "localizing" ||
          item.status === "fitting" ||
          item.status === "synthesizing",
      )
        ? 2000
        : false,
  });
  const selectedId = takeId ?? takes.data?.takes[0]?.id;
  const selected = takes.data?.takes.find((item) => item.id === selectedId);
  const busy =
    takes.data?.takes.some(
      (item) =>
        item.status === "localizing" ||
        item.status === "fitting" ||
        item.status === "synthesizing",
    ) ?? false;
  useEffect(() => {
    if (!takeId && selectedId) setTakeId(selectedId);
  }, [takeId, selectedId]);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    const available =
      voices.data?.voices.filter(
        (item) => item.language === language && item.ready,
      ) ?? [];
    if (!available.some((item) => item.id === voiceId))
      setVoiceId(available[0]?.id ?? "");
  }, [voices.data, language, voiceId]);
  function accept(take: Voiceover) {
    client.setQueryData(key, (old: { takes: Voiceover[] } | undefined) => ({
      takes: [
        take,
        ...(old?.takes ?? []).filter((item) => item.id !== take.id),
      ].slice(0, 20),
    }));
    setTakeId(take.id);
    setDirty(false);
    void client.invalidateQueries({ queryKey: key });
  }
  const generate = useMutation({
    mutationFn: () =>
      createVoiceover(projectId, chapterId, lesson.id, {
        language,
        voiceId,
        speed,
      }),
    onSuccess: accept,
  });
  function canLeave() {
    return (
      !dirty || window.confirm("Discard unsaved localized narration edits?")
    );
  }
  return (
    <WindowPanel title="Voiceover & localization" accent="yellow">
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Languages className="mt-1 size-5 shrink-0" />
          <div>
            <h2 className="font-display text-3xl">Let the lesson speak.</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Translate display text and narration locally, then generate a WAV
              for each scene. Code stays unchanged.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="voice-language" className="field-label">
              Language
            </Label>
            <select
              id="voice-language"
              value={language}
              onChange={(event) =>
                setLanguage(narrationLanguageSchema.parse(event.target.value))
              }
              className={selectClass}
            >
              {Object.entries(languages)
                .filter(([code]) => code !== "mr")
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice" className="field-label">
              Offline voice
            </Label>
            <select
              id="voice"
              value={voiceId}
              onChange={(event) => setVoiceId(event.target.value)}
              className={selectClass}
            >
              <option value="">Choose an available voice</option>
              {voices.data?.voices
                .filter((voice) => voice.language === language)
                .map((voice) => (
                  <option
                    key={voice.id}
                    value={voice.id}
                    disabled={!voice.ready}
                  >
                    {voice.label}
                    {!voice.ready ? " · setup needed" : ""}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-speed" className="field-label">
              Speaking speed
            </Label>
            <select
              id="voice-speed"
              value={String(speed)}
              disabled
              aria-label="Natural teaching pace"
              className={selectClass}
            >
              {[1].map((value) => (
                <option key={value} value={String(value)}>
                  Natural teaching pace ({value}×)
                </option>
              ))}
            </select>
          </div>
        </div>
        {voices.isPending && (
          <p role="status" className="text-xs text-ink-muted">
            Reading the local voice registry…
          </p>
        )}
        {voices.isError && (
          <p role="alert" className="bg-[var(--red-soft)] p-3 text-sm">
            {projectError(voices.error)}{" "}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void voices.refetch();
              }}
            >
              Reload voices
            </Button>
          </p>
        )}
        {voices.data?.voices
          .filter((voice) => voice.language === language && !voice.ready)
          .map((voice) => (
            <p key={voice.id} className="bg-yellow-soft p-3 text-xs">
              {voice.label}: {voice.reason}
            </p>
          ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={
              !voiceId ||
              busy ||
              generate.isPending ||
              lesson.isStale ||
              sourceDirty ||
              takes.isPending ||
              takes.isError
            }
            onClick={() => {
              if (canLeave()) generate.mutate();
            }}
          >
            {busy || generate.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Volume2 className="size-4" />
            )}
            {generate.isPending
              ? "Starting…"
              : busy
                ? "Generating narration…"
                : "Generate voiceover"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void takes.refetch();
              void voices.refetch();
            }}
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
          <span className="text-xs text-ink-muted">
            {sourceDirty
              ? "Save the English storyboard first."
              : lesson.isStale
                ? "Generate a fresh storyboard before creating new audio."
                : "Speech runs locally. No ElevenLabs or external translation API."}
          </span>
        </div>
        {generate.isError && (
          <p role="alert" className="bg-[var(--red-soft)] p-3 text-sm">
            {projectError(generate.error)}
          </p>
        )}
        {takes.isError && (
          <p role="alert" className="bg-[var(--red-soft)] p-3 text-sm">
            {projectError(takes.error)}
          </p>
        )}
        {takes.data && takes.data.takes.length > 0 && (
          <div className="space-y-2 border-t border-border pt-5">
            <Label htmlFor="audio-take" className="field-label">
              Saved takes
            </Label>
            <select
              id="audio-take"
              value={selectedId ?? ""}
              onChange={(event) => {
                if (canLeave()) {
                  setTakeId(event.target.value);
                  setDirty(false);
                }
              }}
              className={selectClass}
            >
              {takes.data.takes.map((take) => (
                <option key={take.id} value={take.id}>
                  {languages[take.language]} · {take.voiceLabel} · {take.speed}×
                  · {take.status} · {take.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        )}
        {selected?.status === "ready" && selected.content && (
          <VideoPanel
            key={`video-${selected.id}`}
            userId={userId}
            projectId={projectId}
            chapterId={chapterId}
            lesson={lesson}
            take={selected}
            locked={
              dirty ||
              sourceDirty ||
              lesson.isStale ||
              busy ||
              !selected.voiceId.startsWith("indic-parler-")
            }
            onTake={accept}
          />
        )}
        {selected &&
          (selected.status === "localizing" ||
            selected.status === "fitting" ||
            selected.status === "synthesizing") && (
            <p
              role="status"
              className="flex items-center gap-3 bg-purple-soft p-4 text-sm"
            >
              <LoaderCircle className="size-4 animate-spin" />
              {selected.status === "localizing"
                ? "Translating narration and display text with local Qwen…"
                : selected.status === "fitting"
                  ? "Shortening narration with local Qwen before generating new audio…"
                  : `Synthesizing scene ${Math.min(selected.completedScenes + 1, selected.totalScenes)} of ${selected.totalScenes}…`}
            </p>
          )}
        {selected?.status === "failed" && (
          <p role="alert" className="bg-[var(--red-soft)] p-3 text-sm">
            {selected.errorMessage} Generate another take to retry; unchanged
            scene audio is cached.
          </p>
        )}
        {selected && !selected.voiceId.startsWith("indic-parler-") && (
          <p className="bg-yellow-soft p-3 text-xs">
            This is a saved take from the previous voice provider. Playback is
            preserved; generate a new Indic Parler take to use the new voices.
          </p>
        )}
        {selected?.status === "ready" && selected.content && (
          <LocalizedTakeEditor
            key={selected.id}
            take={selected}
            lesson={lesson}
            projectId={projectId}
            chapterId={chapterId}
            disabled={
              busy ||
              lesson.isStale ||
              sourceDirty ||
              !selected.voiceId.startsWith("indic-parler-")
            }
            onDirty={setDirty}
            onSaved={accept}
          />
        )}
        <p className="text-xs leading-relaxed text-ink-muted">
          Review pronunciation and translation before teaching. The measured
          audio duration includes narration only; the video preview adds reading
          pauses and transitions. All four voices use locally cached AI4Bharat
          Indic Parler with the existing Python environment and natural teaching
          descriptions.
        </p>
      </div>
    </WindowPanel>
  );
}

function LocalizedTakeEditor({
  take,
  lesson,
  projectId,
  chapterId,
  disabled,
  onDirty,
  onSaved,
}: {
  take: Voiceover;
  lesson: LessonDetail;
  projectId: string;
  chapterId: string;
  disabled: boolean;
  onDirty: (value: boolean) => void;
  onSaved: (take: Voiceover) => void;
}) {
  const [content, setContent] = useState<LocalizedStoryboard>(
    () => take.content as LocalizedStoryboard,
  );
  const [sceneIndex, setSceneIndex] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const dirty = JSON.stringify(content) !== JSON.stringify(take.content);
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
  const scene = content.scenes[sceneIndex];
  const asset = take.audio.find((item) => item.sceneId === scene?.id);
  const total = take.audio.reduce((sum, item) => sum + item.durationSeconds, 0);
  const save = useMutation({
    mutationFn: () =>
      reviseVoiceover(
        projectId,
        chapterId,
        lesson.id,
        take.id,
        localizedStoryboardSchema.parse(content),
      ),
    onSuccess: onSaved,
  });
  const parsed = localizedStoryboardSchema.safeParse(content);
  const issues =
    parsed.success && lesson.content
      ? localizationIssues(lesson.content, parsed.data)
      : parsed.success
        ? []
        : parsed.error.issues
            .slice(0, 3)
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const locked = disabled || save.isPending;
  function editScene(next: typeof scene) {
    setContent({
      ...content,
      scenes: content.scenes.map((item, i) => (i === sceneIndex ? next : item)),
    });
  }
  if (!scene) return null;
  return (
    <div
      className="space-y-4 border-t border-border pt-5"
      lang={take.language}
      dir="ltr"
      style={{
        fontFamily:
          take.language === "en"
            ? undefined
            : take.language === "kn"
              ? '"Noto Sans Kannada", sans-serif'
              : take.language === "te"
                ? '"Noto Sans Telugu", sans-serif'
                : '"Noto Sans Devanagari", sans-serif',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs">
          {languages[take.language]} · {total.toFixed(1)}s of narration ·{" "}
          {take.audio.filter((item) => item.cached).length} cached scenes
        </p>
        <Button
          size="sm"
          disabled={locked || !dirty || issues.length > 0}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Starting…" : "Save edits & regenerate audio"}
        </Button>
      </div>
      {total > lesson.input.request.targetDurationSeconds && (
        <p className="bg-yellow-soft p-3 text-xs">
          Audio exceeds the {lesson.input.request.targetDurationSeconds}s
          target. Phase 4 will fit narration and transitions; no audio has been
          truncated.
        </p>
      )}
      {save.isError && (
        <p role="alert" className="bg-[var(--red-soft)] p-3 text-sm">
          {projectError(save.error)}
        </p>
      )}
      {issues.length > 0 && (
        <p role="alert" className="bg-yellow-soft p-3 text-xs">
          {issues.join(" ")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {content.scenes.map((item, i) => (
          <Button
            key={item.id}
            size="sm"
            variant={i === sceneIndex ? "default" : "outline"}
            onClick={() => {
              setSceneIndex(i);
              setAudioError(false);
            }}
          >
            {i + 1}. {item.type}
          </Button>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="localized-title" className="field-label">
              Scene title
            </Label>
            <Input
              id="localized-title"
              value={scene.title}
              maxLength={160}
              disabled={locked}
              onChange={(event) =>
                editScene({ ...scene, title: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="localized-narration" className="field-label">
              Narration
            </Label>
            <Textarea
              id="localized-narration"
              value={scene.narration}
              maxLength={1600}
              disabled={locked}
              className="min-h-32"
              onChange={(event) =>
                editScene({ ...scene, narration: event.target.value })
              }
            />
          </div>
          {scene.type === "title" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="localized-subtitle" className="field-label">
                  Subtitle
                </Label>
                <Textarea
                  id="localized-subtitle"
                  value={scene.subtitle}
                  maxLength={300}
                  disabled={locked}
                  onChange={(event) =>
                    editScene({ ...scene, subtitle: event.target.value })
                  }
                />
              </div>
              {scene.bullets.map((bullet, index) => (
                <Input
                  key={`${scene.id}-bullet-${index}`}
                  aria-label={`Key point ${index + 1}`}
                  value={bullet}
                  maxLength={200}
                  disabled={locked}
                  onChange={(event) =>
                    editScene({
                      ...scene,
                      bullets: scene.bullets.map((item, i) =>
                        i === index ? event.target.value : item,
                      ),
                    })
                  }
                />
              ))}
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="localized-caption" className="field-label">
                Visual caption
              </Label>
              <Textarea
                id="localized-caption"
                value={scene.caption}
                maxLength={300}
                disabled={locked}
                onChange={(event) =>
                  editScene({ ...scene, caption: event.target.value })
                }
              />
            </div>
          )}
          {scene.type === "diagram" && (
            <div className="space-y-3">
              {scene.nodes.map((node) => (
                <Input
                  key={node.id}
                  aria-label={`Label for ${node.id}`}
                  value={node.label}
                  maxLength={96}
                  disabled={locked}
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
              ))}
              {scene.edges.map((edge, i) => (
                <Input
                  key={`${edge.from}-${edge.to}`}
                  aria-label={`Arrow ${i + 1} label`}
                  value={edge.label}
                  maxLength={64}
                  disabled={locked}
                  onChange={(event) =>
                    editScene({
                      ...scene,
                      edges: scene.edges.map((item, index) =>
                        index === i
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              ))}
            </div>
          )}
          <p role="status" className="text-xs text-ink-muted">
            {dirty
              ? "Unsaved edits. Playback below is from the saved take until you regenerate."
              : "Saved localized text and audio."}
          </p>
        </div>
        <div className="space-y-4">
          <SceneCanvas scene={scene} locale={take.language} />
          {asset && (
            <div className="space-y-2">
              <p className="text-xs text-ink-muted">
                Saved scene audio · {asset.durationSeconds.toFixed(1)}s
                {asset.cached ? " · reused from cache" : ""}
              </p>
              <audio
                key={`${take.id}-${scene.id}`}
                controls
                preload="none"
                src={sceneAudioUrl(
                  projectId,
                  chapterId,
                  lesson.id,
                  take.id,
                  scene.id,
                )}
                onError={() => setAudioError(true)}
                className="w-full"
              >
                Your browser does not support audio playback.
              </audio>
              <a
                href={sceneAudioUrl(
                  projectId,
                  chapterId,
                  lesson.id,
                  take.id,
                  scene.id,
                )}
                download={`drishya-${take.language}-${scene.id}.wav`}
                className="inline-block text-xs underline underline-offset-4"
              >
                Download scene WAV
              </a>
              {audioError && (
                <p role="alert" className="text-xs text-destructive">
                  This audio file could not be loaded. Check that you are signed
                  in, or generate another take to restore missing files.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
