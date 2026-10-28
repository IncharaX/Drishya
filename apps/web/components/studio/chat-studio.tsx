"use client";
import type {
  ConversationDetail,
  CreationSettings,
  ExplanationRevision,
} from "@drishya/contracts";
import { type ChatMessage, creationSettingsSchema } from "@drishya/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUp,
  Check,
  Clapperboard,
  Compass,
  History,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  answerChoice,
  cancelChat,
  chapterChoice,
  chat,
  createChat,
  uploadSource,
  removeSource,
  generateChat,
  retryVideo,
  savePreferenceDraft,
  selectVersion,
  sendFollowup,
} from "@/lib/explanations";
import { projectError } from "@/lib/projects";
import { useComposer } from "@/stores/chat";
import { ChoiceSelect } from "./choice-select";
import { PreferencesCard } from "./preferences";
import { StudioMark, StudioShell } from "./shell";
import { VideoResult } from "./video-result";

const languageLabels = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
};
const activeStates = [
  "queued",
  "planning",
  "generating",
  "narrating",
  "rendering",
];
export function ChatStudio({
  userId,
  chatId,
}: {
  userId: string;
  chatId?: string;
}) {
  const [attachments, setAttachments] = useState<
      { id: string; name: string }[]
    >([]),
    [uploading, setUploading] = useState(false);
  const client = useQueryClient(),
    router = useRouter();
  const [error, setError] = useState(""),
    [moment, setMoment] = useState<{ time: number; revisionId: string } | null>(
      null,
    ),
    [submitting, setSubmitting] = useState(false);
  const key = ["chat", userId, chatId],
    draftKey = `${userId}:${chatId ?? "new"}`;
  const draft = useComposer((state) => state.drafts[draftKey] ?? ""),
    setDraft = useComposer((state) => state.setDraft),
    clear = useComposer((state) => state.clear);
  const bottom = useRef<HTMLDivElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null),
    requestId = useRef(crypto.randomUUID());
  const detail = useQuery({
    queryKey: key,
    queryFn: () => chat(chatId!),
    enabled: !!chatId,
    refetchInterval: (query) =>
      query.state.data?.revisions.some((row) =>
        activeStates.includes(row.status),
      )
        ? 1800
        : 8000,
  });
  const data = detail.data,
    active = data?.revisions.find(
      (row) => row.id === data.conversation.activeRevisionId,
    ),
    busy =
      data?.revisions.some((row) => activeStates.includes(row.status)) ?? false;
  const accept = (next: ConversationDetail) => {
    client.setQueryData(["chat", userId, next.conversation.id], next);
    void client.invalidateQueries({ queryKey: ["chats", userId] });
    void client.invalidateQueries({ queryKey: ["video-library", userId] });
  };
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Cancel a pending draft save when navigation changes its chat target.
  useEffect(
    () => () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    },
    [chatId],
  );
  const saveDraft = (settings: CreationSettings) => {
    if (!chatId) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      if (!creationSettingsSchema.safeParse(settings).success) return;
      void savePreferenceDraft(chatId, settings).catch((reason: unknown) => {
        if (
          typeof reason === "object" &&
          reason &&
          "response" in reason &&
          (reason as { response?: { status?: number } }).response?.status ===
            409
        )
          return;
        setError(
          "Preferences could not be saved yet. Your choices will still be saved when you create the video.",
        );
      });
    }, 600);
  };
  const messageCount = data?.messages.length ?? 0;
  useEffect(() => {
    if (!messageCount) return;
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount]);
  useEffect(() => {
    const element = textarea.current;
    if (element && element.value === draft) {
      element.style.height = "auto";
      element.style.height = `${Math.min(180, element.scrollHeight)}px`;
    }
  }, [draft]);
  async function submit() {
    if (
      (!draft.trim() && !attachments.length) ||
      submitting ||
      busy ||
      uploading
    )
      return;
    setSubmitting(true);
    setError("");
    try {
      const next = chatId
        ? await sendFollowup(
            chatId,
            draft.trim(),
            requestId.current,
            moment?.time,
            moment?.revisionId,
          )
        : await createChat(
            draft.trim() || "Explain the uploaded file",
            requestId.current,
            attachments.map((file) => file.id),
          );
      accept(next);
      clear(draftKey);
      setAttachments([]);
      requestId.current = crypto.randomUUID();
      setMoment(null);
      if (!chatId) router.push(`/workspace/chat/${next.conversation.id}`);
    } catch (reason) {
      setError(projectError(reason));
    } finally {
      setSubmitting(false);
    }
  }
  const previousChat = useRef(chatId);
  useEffect(() => {
    if (previousChat.current !== chatId) {
      requestId.current = crypto.randomUUID();
      previousChat.current = chatId;
    }
  }, [chatId]);
  const create = useMutation({
    mutationFn: ({
      settings,
      id,
    }: {
      settings: CreationSettings;
      id: string;
    }) => generateChat(chatId!, settings, id),
    onSuccess: (next) => {
      requestId.current = crypto.randomUUID();
      accept(next);
    },
  });
  const choose = useMutation({
    mutationFn: ({
      revisionId,
      choice,
    }: {
      revisionId: string;
      choice: "chapters" | "overview";
    }) => chapterChoice(chatId!, revisionId, choice, crypto.randomUUID()),
    onSuccess: accept,
  });
  const answer = useMutation({
    mutationFn: ({
      revisionId,
      value,
    }: {
      revisionId: string;
      value: string;
    }) => answerChoice(chatId!, revisionId, value, crypto.randomUUID()),
    onSuccess: accept,
  });
  const cancel = useMutation({
    mutationFn: () => cancelChat(chatId!),
    onSuccess: accept,
  });
  const retry = useMutation({
    mutationFn: (id: string) => retryVideo(chatId!, id),
    onSuccess: accept,
  });
  const restore = useMutation({
    mutationFn: (id: string) => selectVersion(chatId!, id),
    onSuccess: accept,
  });
  const displayError =
    error ||
    [
      create.error,
      choose.error,
      answer.error,
      cancel.error,
      retry.error,
      restore.error,
    ]
      .filter(Boolean)
      .map(projectError)
      .join(" ");
  const roots = data?.revisions.filter((row) => !row.collectionId) ?? [];
  function choices(row: ExplanationRevision, question?: string) {
    return (
      <div className="v2-question-card">
        <h3>{question ?? "A quick choice before I continue"}</h3>
        {row.status === "awaiting_approval" ? (
          <>
            <p>
              The requested coverage needs more than 2 minutes in total. I’ll
              generate every chapter automatically after you approve.
            </p>
            <ol className="v2-outline">
              {row.outline.map((part, i) => (
                <li key={`${part.title}-${part.objective}`}>
                  <span>{i + 1}</span>
                  <div>
                    <strong>{part.title}</strong>
                    <p>{part.objective}</p>
                  </div>
                  <small>~{Math.round(part.estimatedDuration)}s</small>
                </li>
              ))}
            </ol>
            <div className="v2-choice-actions">
              <button
                type="button"
                className="v2-button v2-button-primary"
                disabled={choose.isPending}
                onClick={() =>
                  choose.mutate({ revisionId: row.id, choice: "chapters" })
                }
              >
                Generate all chapters
                <ArrowRight size={14} />
              </button>
              <button
                type="button"
                className="v2-text-button"
                disabled={choose.isPending}
                onClick={() =>
                  choose.mutate({ revisionId: row.id, choice: "overview" })
                }
              >
                Keep a short overview
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="v2-answer-options">
              {(
                (data?.messages
                  .filter(
                    (message) =>
                      message.kind === "question" &&
                      message.content.revisionId === row.id,
                  )
                  .at(-1)?.content.options ?? []) as {
                  label: string;
                  value: string;
                }[]
              ).map((option) => (
                <button
                  type="button"
                  className="v2-answer"
                  key={option.value}
                  disabled={answer.isPending}
                  onClick={() =>
                    answer.mutate({ revisionId: row.id, value: option.value })
                  }
                >
                  {option.label}
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
            <form
              className="v2-inline-answer"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const value = String(form.get("answer") ?? "").trim();
                if (value) answer.mutate({ revisionId: row.id, value });
              }}
            >
              <input
                name="answer"
                placeholder="Or add the missing detail here"
                aria-label="Additional clarification"
                maxLength={2000}
              />
              <button
                className="v2-icon-button"
                type="submit"
                aria-label="Send clarification"
                disabled={answer.isPending}
              >
                <ArrowUp size={17} />
              </button>
            </form>
          </>
        )}
      </div>
    );
  }
  return (
    <StudioShell
      userId={userId}
      activeChatId={chatId}
      title={data?.conversation.title}
    >
      <div className={`v2-chat-scroll ${!chatId ? "is-empty" : ""}`}>
        {!chatId ? (
          <div className="v2-welcome">
            <StudioMark />
            <span className="v2-welcome-note">
              A clearer picture starts with an idea.
            </span>
            <h1>
              What would you
              <br />
              like to explain?
            </h1>
            <p>
              A concept, a process, a story. Describe it, and let’s make it
              move.
            </p>
            <div className="v2-suggestions">
              {[
                {
                  icon: Compass,
                  title: "Explore a concept",
                  text: "Generate a video explaining our solar system",
                },
                {
                  icon: Clapperboard,
                  title: "Bring a flow to life",
                  text: "Explain this refund flow: customer submits a request → support reviews it → manager approves or asks for more details → finance issues the refund",
                },
                {
                  icon: Sparkles,
                  title: "Make an idea click",
                  text: "Explain how an API works for a beginner in 30 seconds",
                },
              ].map((item) => (
                <button
                  type="button"
                  key={item.title}
                  onClick={() => {
                    setDraft(draftKey, item.text);
                    textarea.current?.focus();
                  }}
                >
                  <item.icon size={20} />
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          </div>
        ) : detail.isPending ? (
          <div className="v2-opening">
            <LoaderCircle className="v2-spin" size={22} />
            Opening your chat…
          </div>
        ) : detail.isError ? (
          <div className="v2-opening">
            <p>{projectError(detail.error)}</p>
            <button
              type="button"
              className="v2-button"
              onClick={() => {
                void detail.refetch();
              }}
            >
              Reload chat
            </button>
          </div>
        ) : (
          <div className="v2-thread">
            {data?.messages.map((message) => {
              if (message.role === "user")
                return (
                  <div className="v2-message v2-message-user" key={message.id}>
                    {message.kind === "preferences" ? (
                      <div className="v2-confirmed-preferences">
                        <Check size={14} />
                        {
                          languageLabels[
                            (message.content.settings as CreationSettings)
                              .language
                          ]
                        }
                        <span>·</span>
                        {
                          (message.content.settings as CreationSettings)
                            .audience
                        }
                        <span>·</span>
                        {(message.content.settings as CreationSettings)
                          .duration === "auto"
                          ? "Up to 120 seconds"
                          : `${(message.content.settings as CreationSettings).duration} seconds`}
                      </div>
                    ) : (
                      <div>
                        {String(message.content.text ?? "")}
                        {Array.isArray(message.content.attachments) &&
                          message.content.attachments.map((value: unknown) => {
                            const file = value as { id: string; name: string };
                            return (
                              <span className="v2-attachment" key={file.id}>
                                {file.name}
                              </span>
                            );
                          })}
                        {typeof message.content.timestamp === "number" && (
                          <small>
                            At {message.content.timestamp.toFixed(1)}s
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                );
              if (message.kind === "preferences") {
                const confirmation = data.messages.find(
                  (item) =>
                    item.role === "user" &&
                    item.kind === "preferences" &&
                    item.sequence > message.sequence,
                );
                const snapshot = creationSettingsSchema.parse(
                  confirmation
                    ? {
                        ...(confirmation.content.settings as CreationSettings),
                        sound:
                          (
                            confirmation.content
                              .settings as Partial<CreationSettings>
                          ).sound ?? "off",
                      }
                    : data.conversation.settings,
                );
                return (
                  <div
                    className="v2-message v2-message-assistant"
                    key={message.id}
                  >
                    <span className="v2-assistant-mark">
                      <StudioMark />
                    </span>
                    <PreferencesCard
                      key={confirmation?.id ?? message.id}
                      initial={snapshot}
                      readOnly={!!confirmation}
                      pending={create.isPending}
                      error={
                        create.error ? projectError(create.error) : undefined
                      }
                      onDraftChange={saveDraft}
                      onSubmit={(settings) => {
                        if (draftTimer.current)
                          clearTimeout(draftTimer.current);
                        create.mutate({ settings, id: requestId.current });
                      }}
                    />
                  </div>
                );
              }
              const row = data.revisions.find(
                (row) => row.id === message.content.revisionId,
              );
              if (message.kind === "generation" && row)
                return (
                  <div
                    className="v2-message v2-message-assistant"
                    key={message.id}
                  >
                    <span className="v2-assistant-mark">
                      <StudioMark />
                    </span>
                    <VideoResult
                      revision={row}
                      allRevisions={data.revisions}
                      parts={data.revisions.filter(
                        (part) => part.collectionId === row.id,
                      )}
                      onCancel={() => cancel.mutate()}
                      onRetry={(id) => retry.mutate(id ?? row.id)}
                      onTimestamp={(time, revisionId) => {
                        setMoment({ time, revisionId: revisionId ?? row.id });
                        textarea.current?.focus();
                      }}
                    />
                  </div>
                );
              if (
                (message.kind === "chapters" || message.kind === "question") &&
                row
              ) {
                const currentQuestion =
                  data.messages
                    .filter(
                      (item) =>
                        item.role === "assistant" &&
                        ["chapters", "question"].includes(item.kind) &&
                        item.content.revisionId === row.id,
                    )
                    .at(-1)?.id === message.id;
                const waiting =
                  currentQuestion &&
                  ["awaiting_approval", "awaiting_input"].includes(row.status);
                if (waiting)
                  return (
                    <div
                      className="v2-message v2-message-assistant"
                      key={message.id}
                    >
                      <span className="v2-assistant-mark">
                        <StudioMark />
                      </span>
                      {choices(row, String(message.content.question ?? ""))}
                    </div>
                  );
                const response =
                  data.messages.find(
                    (item) =>
                      item.role === "user" &&
                      item.sequence > message.sequence &&
                      item.content.revisionId === row.id &&
                      (item.content.answer || item.content.choice),
                  ) ??
                  data.messages.find(
                    (item) =>
                      item.role === "user" &&
                      item.sequence > message.sequence &&
                      item.kind === "text",
                  );
                return (
                  <div
                    className="v2-message v2-message-assistant"
                    key={message.id}
                  >
                    <span className="v2-assistant-mark">
                      <StudioMark />
                    </span>
                    <div className="v2-question-card is-submitted">
                      <h3>
                        {String(message.content.question ?? "Your choice")}
                      </h3>
                      {message.kind === "chapters" && (
                        <ol className="v2-outline">
                          {(
                            (message.content
                              .outline as ExplanationRevision["outline"]) ??
                            row.outline
                          ).map((part) => (
                            <li key={part.title}>
                              <strong>{part.title}</strong>
                              <small>{part.estimatedDuration}s</small>
                            </li>
                          ))}
                        </ol>
                      )}
                      <div className="v2-saved-choices">
                        {(
                          (message.content.options ?? []) as {
                            label: string;
                            value: string;
                          }[]
                        ).map((option) => (
                          <span
                            className={
                              response?.content.answer === option.value ||
                              response?.content.choice === option.value
                                ? "is-selected"
                                : ""
                            }
                            key={option.value}
                          >
                            {option.label}
                          </span>
                        ))}
                      </div>
                      <p>
                        {response
                          ? `Selected: ${String(response.content.text ?? "")}`
                          : "This question is saved in your conversation."}
                      </p>
                    </div>
                  </div>
                );
              }
              if (message.kind === "text")
                return (
                  <div
                    className="v2-message v2-message-assistant"
                    key={message.id}
                  >
                    <span className="v2-assistant-mark">
                      <StudioMark />
                    </span>
                    <p className="v2-assistant-text">
                      {String(message.content.text ?? "")}
                    </p>
                  </div>
                );
              return null;
            })}
            {roots.length > 1 && (
              <div className="v2-version-history">
                <History size={14} />
                <label htmlFor="explanation-version">Current version</label>
                <ChoiceSelect
                  id="explanation-version"
                  label="Current version"
                  value={active?.id ?? ""}
                  disabled={busy || restore.isPending}
                  onChange={(value) => restore.mutate(value)}
                  options={roots.map((row) => ({
                    value: row.id,
                    label: `Version ${row.version} · ${row.status}`,
                    disabled: row.status !== "ready",
                  }))}
                />
                <span>Previous versions are preserved.</span>
              </div>
            )}
            {data && !data.workerOnline && busy && (
              <p className="v2-worker-notice">
                The local worker is reconnecting. Your request is saved and will
                resume.
              </p>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>
      <div className={`v2-composer-area ${!chatId ? "is-start" : ""}`}>
        {displayError && (
          <p role="alert" className="v2-error v2-composer-error">
            {displayError}
          </p>
        )}
        <form
          className="v2-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {moment && (
            <div className="v2-moment-chip">
              Editing at {moment.time.toFixed(1)}s
              <button
                type="button"
                aria-label="Remove timestamp"
                onClick={() => setMoment(null)}
              >
                <X size={12} />
              </button>
            </div>
          )}
          {!chatId && (
            <div className="v2-attachments">
              <label className="v2-text-button">
                {uploading ? "Updating files…" : "Attach a file"}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.docx,.txt,.md,.csv"
                  disabled={uploading || attachments.length >= 3 || submitting}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setUploading(true);
                    try {
                      const uploaded = await uploadSource(file);
                      setAttachments((current) => [...current, uploaded]);
                    } catch (reason) {
                      setError(projectError(reason));
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
              <span>
                PDF, DOCX, TXT, MD, CSV · 10 MB/file · 12,000 extracted
                characters total
              </span>
              {attachments.map((file) => (
                <span className="v2-attachment" key={file.id}>
                  {file.name}
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    disabled={uploading || submitting}
                    onClick={async () => {
                      setUploading(true);
                      try {
                        await removeSource(file.id);
                        setAttachments((current) =>
                          current.filter((item) => item.id !== file.id),
                        );
                      } catch (reason) {
                        setError(projectError(reason));
                      } finally {
                        setUploading(false);
                      }
                    }}
                  >
                    {" "}
                    ×{" "}
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textarea}
            value={draft}
            onChange={(event) => {
              setDraft(draftKey, event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={
              !chatId
                ? "Describe the video or attach a file to explain…"
                : active?.status === "ready" || active?.status === "partial"
                  ? "Ask for a change, or tell me what could be clearer…"
                  : busy
                    ? "Your video is being prepared…"
                    : active?.status === "failed" ||
                        active?.status === "cancelled"
                      ? "Use Retry above to resume this video."
                      : "Your explanation lives here. Choose your preferences above."
            }
            aria-label={chatId ? "Video follow-up" : "Describe your video"}
            maxLength={chatId ? 4000 : 8000}
            rows={2}
            disabled={
              busy ||
              (!!chatId && !["ready", "partial"].includes(active?.status ?? ""))
            }
          />
          <div className="v2-composer-bottom">
            <span>
              {!chatId
                ? "Explain anything. Start with your idea."
                : busy
                  ? "Working locally · you can come back later"
                  : "Changes stay in this conversation."}
            </span>
            <button
              className="v2-send-button"
              type="submit"
              aria-label={chatId ? "Send change" : "Create chat"}
              disabled={
                (!draft.trim() && !attachments.length) ||
                uploading ||
                submitting ||
                busy ||
                (!!chatId &&
                  !["ready", "partial"].includes(active?.status ?? ""))
              }
            >
              {submitting ? (
                <LoaderCircle size={19} className="v2-spin" />
              ) : (
                <ArrowUp size={20} />
              )}
            </button>
          </div>
        </form>
        <p className="v2-composer-footnote">
          Made with local models. Review facts and pronunciation before sharing.
        </p>
      </div>
    </StudioShell>
  );
}
