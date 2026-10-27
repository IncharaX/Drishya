"use client";
import { Slider } from "@drishya/ui/components/slider";
import { Tooltip } from "@drishya/ui/components/tooltip";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type VideoHTMLAttributes,
} from "react";

const stamp = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export const StudioVideo = forwardRef<
  HTMLVideoElement,
  VideoHTMLAttributes<HTMLVideoElement>
>(function StudioVideo({ children, onError, ...props }, ref) {
  const video = useRef<HTMLVideoElement>(null),
    container = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => video.current as HTMLVideoElement);
  const [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [muted, setMuted] = useState(false),
    [full, setFull] = useState(false);
  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => setPlaying(false));
    else element.pause();
  };
  return (
    <div className="v2-player" ref={container}>
      <video
        {...props}
        ref={video}
        controls={false}
        onError={onError}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={() => setTime(video.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          setTime(0);
          setDuration(video.current?.duration ?? 0);
        }}
      >
        {children}
      </video>
      {!playing && (
        <Tooltip content="Play video">
          <button
            type="button"
            className="v2-player-play"
            aria-label="Play video"
            onClick={toggle}
          >
            <Play size={25} fill="currentColor" />
          </button>
        </Tooltip>
      )}
      <div className="v2-player-controls">
        <Tooltip content={playing ? "Pause" : "Play"}>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause video" : "Play video"}
          >
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
        </Tooltip>
        <span className="v2-player-time">
          {stamp(time)} / {stamp(Number.isFinite(duration) ? duration : 0)}
        </span>
        <Slider.Root
          className="v2-slider"
          aria-label="Video timeline"
          min={0}
          max={Math.max(1, Number.isFinite(duration) ? duration : 1)}
          step={0.1}
          value={[time]}
          onValueChange={([value]) => {
            if (video.current) {
              video.current.currentTime = value;
              setTime(value);
            }
          }}
        >
          <Slider.Track className="v2-slider-track">
            <Slider.Range className="v2-slider-range" />
          </Slider.Track>
          <Slider.Thumb className="v2-slider-thumb" aria-label="Seek video" />
        </Slider.Root>
        <Tooltip content={muted ? "Unmute" : "Mute"}>
          <button
            type="button"
            aria-label={muted ? "Unmute video" : "Mute video"}
            onClick={() => {
              if (video.current) video.current.muted = !muted;
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </Tooltip>
        <Tooltip content={full ? "Exit fullscreen" : "Fullscreen"}>
          <button
            type="button"
            aria-label="Toggle fullscreen"
            onClick={() => {
              if (document.fullscreenElement)
                void document.exitFullscreen().then(() => setFull(false));
              else
                void container.current
                  ?.requestFullscreen()
                  .then(() => setFull(true));
            }}
          >
            {full ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
});
