"use client";
import {
  type Timeline,
  timelinePosition,
  type Voiceover,
} from "@drishya/contracts";
import { VideoFrame } from "@drishya/renderer";
import { Button } from "@drishya/ui/components/button";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ChapterPlayer({
  take,
  timeline,
  audioUrl,
}: {
  take: Voiceover;
  timeline: Timeline;
  audioUrl: (sceneId: string) => string;
}) {
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState("");
  const clock = useRef(0),
    media = useRef<(HTMLAudioElement | null)[]>([]),
    starting = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const target = box.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / 1280),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  function seek(value: number) {
    media.current.forEach((audio) => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    });
    const next = Math.min(timeline.duration, Math.max(0, value));
    clock.current = next;
    setTime(next);
    const row = timelinePosition(timeline, next);
    const audio = media.current[row.index];
    if (audio && next >= row.scene.audioStart && next < row.scene.audioEnd)
      audio.currentTime = next - row.scene.audioStart;
  }
  useEffect(() => {
    if (!playing) {
      media.current.forEach((audio) => {
        audio?.pause();
      });
      return;
    }
    let request = 0,
      last = performance.now(),
      disposed = false;
    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;
      const position = timelinePosition(timeline, clock.current),
        row = position.scene;
      const audio = media.current[position.index];
      media.current.forEach((other, i) => {
        if (i !== position.index) other?.pause();
      });
      if (clock.current >= row.audioStart && clock.current < row.audioEnd) {
        if (audio?.ended) {
          clock.current = row.audioEnd;
        } else if (audio && audio.readyState >= 2) {
          if (
            Math.abs(audio.currentTime - (clock.current - row.audioStart)) > 0.2
          )
            audio.currentTime = clock.current - row.audioStart;
          if (audio.paused && !starting.current) {
            starting.current = true;
            void audio
              .play()
              .catch(() => {
                if (!disposed) {
                  setError("Audio playback was blocked. Press play to retry.");
                  setPlaying(false);
                }
              })
              .finally(() => {
                starting.current = false;
              });
          }
          if (!audio.paused)
            clock.current = Math.min(
              row.audioEnd,
              row.audioStart + audio.currentTime,
            );
        }
      } else {
        audio?.pause();
        clock.current = Math.min(timeline.duration, clock.current + dt);
        if (
          clock.current >= row.audioStart &&
          clock.current - dt < row.audioStart
        )
          clock.current = row.audioStart;
      }
      setTime(clock.current);
      if (clock.current >= timeline.duration) {
        setPlaying(false);
        return;
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(request);
      media.current.forEach((audio) => {
        audio?.pause();
      });
    };
  }, [playing, timeline]);
  if (!take.content) return null;
  const position = timelinePosition(timeline, time);
  return (
    <div className="space-y-3">
      <div
        ref={box}
        className="relative aspect-video w-full overflow-hidden border border-ink bg-card"
      >
        <div
          style={{
            width: 1280,
            height: 720,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <VideoFrame
            content={take.content}
            timeline={timeline}
            time={time}
            locale={take.language}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            setError("");
            if (time >= timeline.duration) seek(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            seek(0);
            setPlaying(true);
          }}
        >
          <RotateCcw className="size-4" />
          Replay
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={position.index >= timeline.scenes.length - 1}
          onClick={() => seek(timeline.scenes[position.index + 1].start)}
        >
          <SkipForward className="size-4" />
          Next scene
        </Button>
        <span className="text-xs text-ink-muted">
          {time.toFixed(1)} / {timeline.duration.toFixed(1)}s · Scene{" "}
          {position.index + 1}/{timeline.scenes.length}
        </span>
      </div>
      <input
        aria-label="Seek chapter"
        className="w-full accent-[var(--ink)]"
        type="range"
        min="0"
        max={timeline.duration}
        step={1 / 24}
        value={time}
        onChange={(event) => seek(Number(event.target.value))}
      />
      <div className="flex flex-wrap gap-2">
        {take.content.scenes.map((scene, i) => (
          <Button
            key={scene.id}
            size="sm"
            variant={i === position.index ? "secondary" : "ghost"}
            onClick={() => seek(timeline.scenes[i].start)}
          >
            {i + 1}. {scene.title}
          </Button>
        ))}
      </div>
      {timeline.scenes.map((row, i) => (
        <audio
          key={row.sceneId}
          ref={(element) => {
            media.current[i] = element;
          }}
          src={audioUrl(row.sceneId)}
          preload="auto"
          onError={() => {
            setError(
              "A scene audio file could not load. Regenerate narration and retry.",
            );
            setPlaying(false);
          }}
          aria-label={`Narration for scene ${i + 1}`}
        >
          <track kind="captions" />
        </audio>
      ))}
      {error && (
        <p role="alert" className="text-sm text-[var(--red)]">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-muted">
        Caption timing is estimated from narration chunks. Reading pauses may
        extend a short chapter to 30 seconds.
      </p>
    </div>
  );
}
