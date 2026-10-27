"use client";
import {
  type CreationSettings,
  creationSettingsSchema,
} from "@drishya/contracts";
import { Checkbox } from "@drishya/ui/components/checkbox";
import { Input } from "@drishya/ui/components/input";
import { Tooltip } from "@drishya/ui/components/tooltip";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { useId, useState } from "react";
import { ChoiceSelect } from "./choice-select";
export function PreferencesCard({
  initial,
  pending,
  onSubmit,
  error,
  readOnly = false,
  onDraftChange,
}: {
  initial: CreationSettings;
  pending: boolean;
  onSubmit?: (settings: CreationSettings) => void;
  readOnly?: boolean;
  onDraftChange?: (settings: CreationSettings) => void;
  error?: string;
}) {
  const id = useId();
  const [validation, setValidation] = useState("");
  const [settings, setSettings] = useState(initial),
    [more, setMore] = useState(readOnly);
  const field = <K extends keyof CreationSettings>(
    key: K,
    value: CreationSettings[K],
  ) =>
    setSettings((old) => {
      const next = { ...old, [key]: value };
      onDraftChange?.(next);
      return next;
    });
  return (
    <form
      className={`v2-preferences ${readOnly ? "is-submitted" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (readOnly) return;
        const parsed = creationSettingsSchema.safeParse(settings);
        if (!parsed.success) {
          setValidation(
            "Choose a duration from 10 to 960 seconds. Chapters are used only above 120 seconds.",
          );
          return;
        }
        setValidation("");
        onSubmit?.(parsed.data);
      }}
    >
      <div className="v2-card-title">
        <span>{readOnly ? "Your selected preferences" : "Make it yours"}</span>
        <span className="v2-soft-label">A few preferences</span>
      </div>
      <p>
        {readOnly
          ? "Saved with this request. These are the exact choices used for generation."
          : "Choose the direction. I’ll handle the explanation, narration and animation."}
      </p>
      <div className="v2-fields">
        <label htmlFor={`${id}-language`}>
          Language
          <ChoiceSelect
            label="Language"
            id={`${id}-language`}
            value={settings.language}
            disabled={readOnly || pending}
            onChange={(value) =>
              field("language", value as CreationSettings["language"])
            }
            options={[
              { value: "en", label: "English" },
              { value: "hi", label: "Hindi · हिन्दी" },
              { value: "kn", label: "Kannada · ಕನ್ನಡ" },
              { value: "te", label: "Telugu · తెలుగు" },
            ]}
          />
        </label>
        <label htmlFor={`${id}-audience`}>
          Audience
          <ChoiceSelect
            label="Audience"
            id={`${id}-audience`}
            value={settings.audience}
            disabled={readOnly || pending}
            onChange={(value) =>
              field("audience", value as CreationSettings["audience"])
            }
            options={[
              { value: "general", label: "General audience" },
              { value: "beginner", label: "Beginners" },
              { value: "familiar", label: "Already familiar" },
              { value: "advanced", label: "Advanced / technical" },
            ]}
          />
        </label>
        <label htmlFor={`${id}-coverage`}>
          Coverage
          <ChoiceSelect
            label="Coverage"
            id={`${id}-coverage`}
            value={settings.coverage}
            disabled={readOnly || pending}
            onChange={(value) =>
              field("coverage", value as CreationSettings["coverage"])
            }
            options={[
              { value: "overview", label: "A clear overview" },
              { value: "how_it_works", label: "How it works" },
              { value: "steps", label: "Explain the steps / flow" },
              { value: "complete", label: "A complete explanation" },
            ]}
          />
        </label>
        <label htmlFor={`${id}-duration`}>
          Length
          <ChoiceSelect
            label="Length"
            id={`${id}-duration`}
            value={settings.duration === "auto" ? "auto" : "custom"}
            disabled={readOnly || pending}
            onChange={(value) =>
              field("duration", value === "auto" ? "auto" : 40)
            }
            options={[
              { value: "auto", label: "Automatic · up to 2 minutes" },
              { value: "custom", label: "Exact duration" },
            ]}
          />
          {typeof settings.duration === "number" && (
            <div className="v2-duration-input">
              <Input
                aria-label="Exact duration in seconds"
                type="number"
                min={10}
                max={960}
                value={settings.duration}
                disabled={readOnly || pending}
                onChange={(event) =>
                  field("duration", Number(event.target.value))
                }
              />
              <span>seconds</span>
            </div>
          )}
        </label>
      </div>
      <button
        type="button"
        className="v2-text-button"
        onClick={() => setMore(!more)}
        aria-expanded={more}
      >
        <SlidersHorizontal size={14} />
        Additional preferences
        <ChevronDown size={14} />
      </button>
      {more && (
        <div className="v2-advanced-fields">
          <label htmlFor={`${id}-style`}>
            Visual direction
            <ChoiceSelect
              label="Visual direction"
              id={`${id}-style`}
              value={settings.style}
              disabled={readOnly || pending}
              onChange={(value) =>
                field("style", value as CreationSettings["style"])
              }
              options={[
                { value: "auto", label: "Choose what explains it best" },
                { value: "cinematic", label: "Cinematic" },
                { value: "graphic", label: "Motion graphics" },
                { value: "spatial", label: "3D / spatial" },
              ]}
            />
          </label>
          <label className="v2-checkbox" htmlFor={`${id}-captions`}>
            <Checkbox
              id={`${id}-captions`}
              disabled={readOnly || pending}
              checked={settings.captions}
              onCheckedChange={(checked) => field("captions", checked === true)}
            />
            Include captions
          </label>
          <label>
            Specific facts or steps to preserve
            <textarea
              value={settings.context}
              disabled={readOnly || pending}
              onChange={(event) => field("context", event.target.value)}
              placeholder="Optional: paste your exact flow, facts, or requirements."
              maxLength={6000}
            />
          </label>
        </div>
      )}
      {validation && (
        <p role="alert" className="v2-error">
          {validation}
        </p>
      )}
      {error && (
        <p role="alert" className="v2-error">
          {error}
        </p>
      )}
      <div className="v2-sound-choice">
        <label htmlFor={`${id}-sound`}>
          <Checkbox
            id={`${id}-sound`}
            checked={settings.sound !== "off"}
            disabled={readOnly || pending}
            onCheckedChange={(checked) =>
              field("sound", checked === true ? "auto" : "off")
            }
          />{" "}
          Background score and subtle sound effects
        </label>
        <Tooltip content="A locally composed score follows the topic’s mood and stays beneath the narration.">
          <button
            type="button"
            className="v2-icon-button"
            aria-label="About sound design"
          >
            <Info size={15} />
          </button>
        </Tooltip>
      </div>
      <div className="v2-card-actions">
        <span>
          Chapters appear only when their combined length exceeds 2 minutes.
        </span>
        <button
          className="v2-button v2-button-primary"
          disabled={pending || readOnly}
          type="submit"
        >
          {readOnly
            ? "Preferences saved"
            : pending
              ? "Starting…"
              : "Create video"}
          <ArrowRight size={15} />
        </button>
      </div>
    </form>
  );
}
