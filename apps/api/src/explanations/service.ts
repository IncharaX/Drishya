import { sourceUpload } from "@drishya/db/schema";
import {
  type CreationSettings,
  chatMessageSchema,
  conversationDetailSchema,
  conversationSchema,
  creationSettingsSchema,
  explanationRevisionSchema,
} from "@drishya/contracts";
import {
  conversation,
  conversationMessage,
  explanationRevision,
  generationJob,
  project,
  workerHeartbeat,
} from "@drishya/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../database";
import { HttpError } from "../http-error";
import { cancelJob, enqueue, retryJob } from "../jobs/queue";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type RevisionRecord = typeof explanationRevision.$inferSelect;
export function serializeRevision(row: RevisionRecord) {
  return explanationRevisionSchema.parse({
    ...row,
    duration: row.duration === null ? null : row.duration / 1000,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
const serializeConversation = (row: typeof conversation.$inferSelect) =>
  conversationSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
export async function appendMessage(
  tx: Tx,
  id: string,
  role: "user" | "assistant",
  kind: typeof conversationMessage.$inferInsert.kind,
  content: Record<string, unknown>,
  requestId?: string,
) {
  const [current] = await tx
    .select()
    .from(conversation)
    .where(eq(conversation.id, id))
    .for("update");
  if (!current) throw new HttpError(404, "Chat not found.");
  await tx.insert(conversationMessage).values({
    conversationId: id,
    sequence: current.nextSequence,
    role,
    kind,
    content,
    requestId,
  });
  await tx
    .update(conversation)
    .set({ nextSequence: current.nextSequence + 1, updatedAt: new Date() })
    .where(eq(conversation.id, id));
}
export function inferSettings(text: string, base?: CreationSettings) {
  const settings = creationSettingsSchema.parse(base ?? {});
  settings.voice = "male";
  if (/1080p|full.?hd/iu.test(text)) settings.resolution = "1080p";
  else if (/720p/iu.test(text)) settings.resolution = "720p";
  const languages = {
    हिंदी: "hi",
    हिन्दी: "hi",
    ಕನ್ನಡ: "kn",
    తెలుగు: "te",
    hindi: "hi",
    kannada: "kn",
    telugu: "te",
    english: "en",
  } as const;
  for (const [name, language] of Object.entries(languages))
    if (
      new RegExp(
        `[\\s,;:]${name}(?=$|[\\s,;.!])|^${name}(?=$|[\\s,;.!])`,
        "iu",
      ).test(text)
    )
      settings.language = language;
  if (/हिंदी|हिन्दी/iu.test(text)) settings.language = "hi";
  if (/ಕನ್ನಡ/iu.test(text)) settings.language = "kn";
  if (/తెలుగు/iu.test(text)) settings.language = "te";
  const explicitlyRequestedLanguage = text
    .match(/\b(?:in|language\s*:)\s+(english|hindi|kannada|telugu)\b/iu)?.[1]
    ?.toLowerCase() as "english" | "hindi" | "kannada" | "telugu" | undefined;
  if (explicitlyRequestedLanguage)
    settings.language = languages[explicitlyRequestedLanguage];
  if (/\b(?:one|a) minute\b/iu.test(text)) settings.duration = 60;
  if (
    /beginner|kids|children|years?[ -]old|(?:[1-9](?:st|nd|rd|th)? (?:grade|standard))|school student/iu.test(
      text,
    )
  )
    settings.audience = "beginner";
  else if (/expert|advanced|technical audience/iu.test(text))
    settings.audience = "advanced";
  const duration = text.match(/\b(\d{1,3})[\s-]*(?:seconds?|secs?|s\b)/iu);
  if (duration && Number(duration[1]) >= 10 && Number(duration[1]) <= 960)
    settings.duration = Number(duration[1]);
  const minutes = text.match(/\b(\d+(?:\.\d+)?)[\s-]*(?:minutes?|mins?|m\b)/iu);
  if (
    !duration &&
    minutes &&
    Number(minutes[1]) * 60 >= 10 &&
    Number(minutes[1]) * 60 <= 960
  )
    settings.duration = Math.round(Number(minutes[1]) * 60);
  if (
    /comprehensive|in.depth|everything about|complete (?:course|explanation)|all the details/iu.test(
      text,
    )
  )
    settings.coverage = "complete";
  else if (/step.by.step|\bsteps\b|workflow|process|\bflow\b/iu.test(text))
    settings.coverage = "steps";
  if (/\b3d\b|three.dimensional/iu.test(text)) settings.style = "spatial";
  else if (/cinematic/iu.test(text)) settings.style = "cinematic";
  else if (/2d|motion graphics/iu.test(text)) settings.style = "graphic";
  if (/(?:remove|disable|no) (?:subtitles|captions)/iu.test(text))
    settings.captions = false;
  if (/(?:remove|disable|no|mute).*(?:music|sound|score)/iu.test(text))
    settings.sound = "off";
  else if (/(?:add|enable).*(?:music|sound|score)/iu.test(text))
    settings.sound = "auto";
  return settings;
}
export async function ownedChat(
  userId: string,
  id: string,
  tx: typeof db | Tx = db,
) {
  const [row] = await tx
    .select()
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)));
  if (!row) throw new HttpError(404, "Chat not found.");
  return row;
}
export async function listConversations(
  userId: string,
  offset = 0,
  search = "",
) {
  const rows = await db
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.userId, userId),
        search
          ? or(
              ilike(conversation.title, `%${search}%`),
              ilike(conversation.prompt, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(conversation.updatedAt), conversation.id)
    .offset(offset)
    .limit(51);
  return {
    conversations: rows.slice(0, 50).map(serializeConversation),
    hasMore: rows.length > 50,
  };
}
export async function detail(userId: string, id: string) {
  const row = await ownedChat(userId, id);
  const [messages, revisions, workers, history, queue, revisionJobs] = await Promise.all([
    db
      .select()
      .from(conversationMessage)
      .where(eq(conversationMessage.conversationId, id))
      .orderBy(asc(conversationMessage.sequence)),
    db
      .select()
      .from(explanationRevision)
      .where(eq(explanationRevision.conversationId, id))
      .orderBy(
        asc(explanationRevision.createdAt),
        asc(explanationRevision.partIndex),
      ),
    db
      .select({ id: workerHeartbeat.id })
      .from(workerHeartbeat)
      .where(sql`${workerHeartbeat.seenAt}>now()-interval '30 seconds'`)
      .limit(1),
    db
      .select({
        timings: explanationRevision.timings,
        duration: explanationRevision.duration,
      })
      .from(explanationRevision)
      .innerJoin(
        conversation,
        eq(conversation.id, explanationRevision.conversationId),
      )
      .where(
        and(
          eq(conversation.userId, userId),
          eq(explanationRevision.status, "ready"),
        ),
      )
      .orderBy(desc(explanationRevision.createdAt))
      .limit(12),
    db
      .select({
        resourceId: generationJob.resourceId,
        status: generationJob.status,
        createdAt: generationJob.createdAt,
        progress: generationJob.progress,
      })
      .from(generationJob)
      .where(inArray(generationJob.status, ["queued", "running", "retrying"])),
    db.select({resourceId:generationJob.resourceId,status:generationJob.status,errorMessage:generationJob.errorMessage})
      .from(generationJob)
      .innerJoin(explanationRevision,eq(generationJob.resourceId,explanationRevision.id))
      .where(eq(explanationRevision.conversationId,id))
      .orderBy(desc(generationJob.createdAt)),
  ]);
  // A worker can exit after the job becomes terminal but before the revision's
  // final status is written. Never leave the chat showing an endless spinner.
  for (const revision of revisions) {
    if (!["queued","planning","generating","narrating","rendering"].includes(revision.status)) continue;
    const job=revisionJobs.find(job=>job.resourceId===revision.id);
    if(job?.status==="failed" || job?.status==="cancelled"){
      revision.status=job.status;
      revision.stage=job.status==="failed"?"Generation needs attention":"Cancelled";
      revision.errorMessage=job.errorMessage??"Generation stopped. Retry this version to reuse saved progress.";
    }
  }
  const usable = history.filter(
    (item) => item.duration && item.timings.totalMs,
  );
  const average = (key: string, fallback: number) => {
    const values = usable
      .map((item) => item.timings[key])
      .filter((value) => value > 0);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length / 1000
      : fallback;
  };
  const narrationRate = usable
    .filter((item) => item.timings.narrationMs && item.duration)
    .map((item) => item.timings.narrationMs / (item.duration ?? 1));
  const rate = narrationRate.length
    ? narrationRate.reduce((sum, value) => sum + value, 0) /
      narrationRate.length
    : 8;
  const estimate = (revision: RevisionRecord) => {
    if (
      !["queued", "planning", "generating", "narrating", "rendering"].includes(
        revision.status,
      ) ||
      revision.outline.length
    )
      return null;
    const seconds =
      typeof revision.settings.duration === "number"
        ? Math.min(120, revision.settings.duration)
        : 60;
    const render = average("renderMs", 45),
      writing = average("writingMs", 90);
    const missing = revision.plan
      ? revision.plan.beats.filter((beat) => !beat.audioKey).length /
        revision.plan.beats.length
      : 1;
    const speech = seconds * rate * missing;
    let remaining =
      revision.status === "rendering"
        ? Math.max(
            8,
            render * (1 - (Math.max(64, revision.progress) - 64) / 36),
          )
        : (revision.status === "narrating"
            ? 0
            : revision.intent === "edit"
              ? 35
              : writing) +
          speech +
          render;
    const elapsed = Math.max(
      0,
      (Date.now() - revision.updatedAt.getTime()) / 1000,
    );
    remaining = Math.max(10, remaining - Math.min(elapsed, remaining * 0.7));
    const ahead =
      revision.status === "queued"
        ? queue.filter(
            (job) =>
              job.resourceId !== revision.id &&
              (job.status === "running" || job.createdAt < revision.createdAt),
          )
        : [];
    const typical = average("totalMs", writing + seconds * rate + render);
    remaining += ahead.reduce(
      (sum, job) =>
        sum +
        typical *
          (job.status === "running"
            ? Math.max(0.15, 1 - job.progress / 100)
            : 1),
      0,
    );
    return {
      queueAhead: ahead.length,
      lowSeconds: Math.round(remaining * 0.7),
      highSeconds: Math.round(remaining * 1.4),
      basis: usable.length ? ("history" as const) : ("initial" as const),
    };
  };
  return conversationDetailSchema.parse({
    conversation: serializeConversation(row),
    messages: messages.map((m) =>
      chatMessageSchema.parse({ ...m, createdAt: m.createdAt.toISOString() }),
    ),
    revisions: revisions.map((revision) => ({
      ...serializeRevision(revision),
      estimate: estimate(revision),
    })),
    workerOnline: !!workers.length,
  });
}
export async function createConversation(
  userId: string,
  prompt: string,
  requestId: string,
  attachmentIds: string[] = [],
) {
  const id = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${userId}),hashtext(${requestId}))`,
    );
    const [existing] = await tx
      .select()
      .from(conversation)
      .where(
        and(
          eq(conversation.userId, userId),
          eq(conversation.requestId, requestId),
        ),
      );
    if (existing) return existing.id;
    const [stub] = await tx
      .insert(project)
      .values({
        userId,
        title: prompt.slice(0, 120),
        request: {
          topic: prompt.slice(0, 500),
          language: "en",
          level: "beginner",
          targetDurationSeconds: 90,
          approach: "overview",
        },
        status: "ready",
        model: "drishya-v2",
      })
      .returning();
    const settings = inferSettings(prompt);
    const [chat] = await tx
      .insert(conversation)
      .values({
        userId,
        projectId: stub.id,
        requestId,
        title:
          prompt
            .replace(
              /^(?:please )?(?:generate|create|make)(?: me)? (?:a )?(?:video|explanation)(?: explaining| about| of)?\s*/iu,
              "",
            )
            .slice(0, 100) || "New explanation",
        prompt,
        settings,
      })
      .returning();
    const attached = [];
    let sourceCharacters = 0;
    for (const attachmentId of [...new Set(attachmentIds)]) {
      const [file] = await tx
        .select()
        .from(sourceUpload)
        .where(
          and(
            eq(sourceUpload.id, attachmentId),
            eq(sourceUpload.userId, userId),
          ),
        )
        .for("update");
      if (!file || file.conversationId)
        throw new HttpError(
          400,
          "One of these files is unavailable. Upload it again.",
        );
      sourceCharacters += file.text.length;
      if (sourceCharacters > 12000)
        throw new HttpError(
          400,
          "Attached files exceed 12,000 extracted characters together.",
        );
      await tx
        .update(sourceUpload)
        .set({ conversationId: chat.id })
        .where(eq(sourceUpload.id, file.id));
      attached.push({ id: file.id, name: file.name, size: file.size });
    }
    await appendMessage(
      tx,
      chat.id,
      "user",
      "text",
      { text: prompt, attachments: attached },
      requestId,
    );
    await appendMessage(tx, chat.id, "assistant", "preferences", {
      settings,
      text: "A few preferences, then I’ll take care of the video.",
    });
    return chat.id;
  });
  return detail(userId, id);
}
async function ensureNoActive(tx: Tx, chat: typeof conversation.$inferSelect) {
  const [active] = await tx
    .select({ id: explanationRevision.id })
    .from(explanationRevision)
    .where(
      and(
        eq(explanationRevision.conversationId, chat.id),
        inArray(explanationRevision.status, [
          "queued",
          "planning",
          "generating",
          "narrating",
          "rendering",
        ]),
      ),
    )
    .limit(1);
  if (active)
    throw new HttpError(
      409,
      "A video is already being prepared in this chat. Wait or cancel it before sending a change.",
    );
}
export async function makeRevision(
  tx: Tx,
  chat: typeof conversation.$inferSelect,
  values: Partial<typeof explanationRevision.$inferInsert> & {
    request: string;
    settings: CreationSettings;
    title: string;
  },
) {
  const [last] = await tx
    .select({ version: explanationRevision.version })
    .from(explanationRevision)
    .where(eq(explanationRevision.conversationId, chat.id))
    .orderBy(desc(explanationRevision.version))
    .limit(1);
  const [row] = await tx
    .insert(explanationRevision)
    .values({
      conversationId: chat.id,
      version: (last?.version ?? 0) + 1,
      ...values,
      settings: creationSettingsSchema.parse({
        ...values.settings,
        voice: "male",
      }),
    })
    .returning();
  await enqueue(tx, {
    userId: chat.userId,
    projectId: chat.projectId,
    kind: "explanation",
    resourceId: row.id,
  });
  return row;
}
export async function generate(
  userId: string,
  id: string,
  settings: CreationSettings,
  requestId: string,
) {
  await db.transaction(async (tx) => {
    const chat = await ownedChat(userId, id, tx);
    await tx
      .select()
      .from(conversation)
      .where(eq(conversation.id, id))
      .for("update");
    const [duplicate] = await tx
      .select({ id: conversationMessage.id })
      .from(conversationMessage)
      .where(
        and(
          eq(conversationMessage.conversationId, id),
          eq(conversationMessage.requestId, requestId),
        ),
      );
    if (duplicate) return;
    await ensureNoActive(tx, chat);
    const row = await makeRevision(tx, chat, {
      request: chat.prompt,
      settings,
      title: chat.title,
    });
    await tx
      .update(conversation)
      .set({ settings, activeRevisionId: row.id, updatedAt: new Date() })
      .where(eq(conversation.id, id));
    await appendMessage(
      tx,
      id,
      "user",
      "preferences",
      { settings, confirmed: true },
      requestId,
    );
    await appendMessage(tx, id, "assistant", "generation", {
      revisionId: row.id,
    });
  });
  return detail(userId, id);
}
export async function followup(
  userId: string,
  id: string,
  input: {
    text: string;
    requestId: string;
    timestamp?: number;
    beatId?: string;
    sourceRevisionId?: string;
  },
) {
  await db.transaction(async (tx) => {
    const chat = await ownedChat(userId, id, tx);
    await tx
      .select()
      .from(conversation)
      .where(eq(conversation.id, id))
      .for("update");
    const [duplicate] = await tx
      .select({ id: conversationMessage.id })
      .from(conversationMessage)
      .where(
        and(
          eq(conversationMessage.conversationId, id),
          eq(conversationMessage.requestId, input.requestId),
        ),
      );
    if (duplicate) return;
    await ensureNoActive(tx, chat);
    const sourceId = input.sourceRevisionId ?? chat.activeRevisionId;
    let [base] = sourceId
      ? await tx
          .select()
          .from(explanationRevision)
          .where(
            and(
              eq(explanationRevision.id, sourceId!),
              eq(explanationRevision.conversationId, id),
              inArray(explanationRevision.status, ["ready", "partial"]),
            ),
          )
      : [];
    if (!base)
      throw new HttpError(409, "Finish a video before requesting an edit.");
    const partId = base.collectionId ? base.id : undefined;
    if (base.collectionId) {
      const [parent] = await tx
        .select()
        .from(explanationRevision)
        .where(
          and(
            eq(explanationRevision.id, base.collectionId),
            eq(explanationRevision.conversationId, id),
          ),
        );
      if (!parent) throw new HttpError(404, "Collection not found.");
      base = parent;
    }
    const settings = inferSettings(input.text, base.settings);
    const restructure =
      !partId &&
      !base.plan &&
      base.outline.length > 0 &&
      settings.duration !== base.settings.duration;
    const row = await makeRevision(tx, chat, {
      request: restructure
        ? `${chat.prompt}\nRequested change: ${input.text}`
        : input.text,
      settings,
      title: base.title,
      intent: restructure ? "create" : "edit",
      sourceRevisionId: base.id,
      edit: { timestamp: input.timestamp, beatId: input.beatId, partId },
    });
    await tx
      .update(conversation)
      .set({ activeRevisionId: row.id, settings, updatedAt: new Date() })
      .where(eq(conversation.id, id));
    await appendMessage(
      tx,
      id,
      "user",
      "text",
      { text: input.text, timestamp: input.timestamp },
      input.requestId,
    );
    await appendMessage(tx, id, "assistant", "generation", {
      revisionId: row.id,
    });
  });
  return detail(userId, id);
}
export async function decide(
  userId: string,
  id: string,
  revisionId: string,
  choice: "chapters" | "overview",
  requestId: string,
) {
  await db.transaction(async (tx) => {
    const chat = await ownedChat(userId, id, tx);
    await tx
      .select()
      .from(conversation)
      .where(eq(conversation.id, id))
      .for("update");
    const [duplicate] = await tx
      .select({ id: conversationMessage.id })
      .from(conversationMessage)
      .where(
        and(
          eq(conversationMessage.conversationId, id),
          eq(conversationMessage.requestId, requestId),
        ),
      );
    if (duplicate) return;
    const [row] = await tx
      .select()
      .from(explanationRevision)
      .where(
        and(
          eq(explanationRevision.id, revisionId),
          eq(explanationRevision.conversationId, id),
          eq(explanationRevision.status, "awaiting_approval"),
        ),
      )
      .for("update");
    if (!row)
      throw new HttpError(409, "This chapter choice is no longer active.");
    await tx
      .update(explanationRevision)
      .set({
        approved: choice === "chapters",
        settings:
          choice === "overview"
            ? { ...row.settings, coverage: "overview", duration: 120 }
            : row.settings,
        outline: choice === "overview" ? [] : row.outline,
        plan: choice === "overview" ? null : row.plan,
        status: "queued",
        stage: "Queued",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(explanationRevision.id, row.id));
    await enqueue(tx, {
      userId,
      projectId: chat.projectId,
      kind: "explanation",
      resourceId: row.id,
    });
    await appendMessage(
      tx,
      id,
      "user",
      "text",
      {
        revisionId: row.id,
        choice,
        text:
          choice === "chapters"
            ? "Generate all chapters"
            : "Keep it as a short overview",
      },
      requestId,
    );
  });
  return detail(userId, id);
}
export async function answer(
  userId: string,
  id: string,
  revisionId: string,
  answerText: string,
  requestId: string,
) {
  await db.transaction(async (tx) => {
    const chat = await ownedChat(userId, id, tx);
    await tx
      .select()
      .from(conversation)
      .where(eq(conversation.id, id))
      .for("update");
    const [duplicate] = await tx
      .select({ id: conversationMessage.id })
      .from(conversationMessage)
      .where(
        and(
          eq(conversationMessage.conversationId, id),
          eq(conversationMessage.requestId, requestId),
        ),
      );
    if (duplicate) return;
    const [row] = await tx
      .select()
      .from(explanationRevision)
      .where(
        and(
          eq(explanationRevision.id, revisionId),
          eq(explanationRevision.conversationId, id),
          eq(explanationRevision.status, "awaiting_input"),
        ),
      )
      .for("update");
    if (!row)
      throw new HttpError(409, "This question has already been answered.");
    const selectedBeatIds = row.plan?.beats.some(
      (beat) => beat.id === answerText,
    )
      ? [answerText]
      : row.edit.selectedBeatIds;
    await tx
      .update(explanationRevision)
      .set({
        status: "queued",
        stage: "Queued",
        settings: /^timing:\d+$/u.test(answerText)
          ? { ...row.settings, duration: Number(answerText.split(":")[1]) }
          : row.settings,
        edit: {
          ...row.edit,
          answer: answerText,
          selectedBeatIds,
          ...(/^timing:\d+$/u.test(answerText) ? { fitAttempts: 0 } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(explanationRevision.id, row.id));
    await enqueue(tx, {
      userId,
      projectId: chat.projectId,
      kind: "explanation",
      resourceId: row.id,
    });
    await appendMessage(
      tx,
      id,
      "user",
      "text",
      {
        revisionId: row.id,
        answer: answerText,
        text:
          row.edit.clarification?.options.find(
            (option) => option.value === answerText,
          )?.label ?? answerText,
      },
      requestId,
    );
  });
  return detail(userId, id);
}
export async function cancelConversation(userId: string, id: string) {
  const chat = await ownedChat(userId, id);
  const rows = await db
    .select({ job: generationJob })
    .from(generationJob)
    .innerJoin(
      explanationRevision,
      eq(generationJob.resourceId, explanationRevision.id),
    )
    .where(
      and(
        eq(explanationRevision.conversationId, id),
        eq(generationJob.userId, userId),
        inArray(generationJob.status, ["queued", "running", "retrying"]),
      ),
    );
  for (const { job } of rows)
    await cancelJob(userId, job.id).catch((error) => {
      if (!(error instanceof HttpError && error.status === 409)) throw error;
    });
  return detail(userId, chat.id);
}
export async function retryRevision(
  userId: string,
  id: string,
  revisionId: string,
) {
  await ownedChat(userId, id);
  const [row] = await db
    .select()
    .from(explanationRevision)
    .where(
      and(
        eq(explanationRevision.id, revisionId),
        eq(explanationRevision.conversationId, id),
      ),
    );
  if (!row) throw new HttpError(404, "Video not found.");
  const [job] = await db
    .select()
    .from(generationJob)
    .where(
      and(
        eq(generationJob.resourceId, row.id),
        eq(generationJob.userId, userId),
        eq(generationJob.kind, "explanation"),
      ),
    )
    .orderBy(desc(generationJob.createdAt))
    .limit(1);
  if (!job) throw new HttpError(404, "Generation not found.");
  await retryJob(userId, job.id);
  return detail(userId, id);
}
export async function activateRevision(
  userId: string,
  id: string,
  revisionId: string,
) {
  await db.transaction(async (tx) => {
    const chat = await ownedChat(userId, id, tx);
    await ensureNoActive(tx, chat);
    const [row] = await tx
      .select()
      .from(explanationRevision)
      .where(
        and(
          eq(explanationRevision.id, revisionId),
          eq(explanationRevision.conversationId, id),
          eq(explanationRevision.status, "ready"),
          isNull(explanationRevision.collectionId),
        ),
      );
    if (!row) throw new HttpError(409, "Choose a completed version.");
    await tx
      .update(conversation)
      .set({
        activeRevisionId: row.id,
        settings: row.settings,
        updatedAt: new Date(),
      })
      .where(eq(conversation.id, id));
  });
  return detail(userId, id);
}

export async function savePreferences(
  userId: string,
  id: string,
  settings: CreationSettings,
) {
  await db.transaction(async (tx) => {
    await ownedChat(userId, id, tx);
    const [chat] = await tx
      .select()
      .from(conversation)
      .where(eq(conversation.id, id))
      .for("update");
    if (chat.activeRevisionId)
      throw new HttpError(
        409,
        "This request already has saved generation settings.",
      );
    await tx
      .update(conversation)
      .set({
        settings: creationSettingsSchema.parse({ ...settings, voice: "male" }),
        updatedAt: new Date(),
      })
      .where(eq(conversation.id, id));
  });
  return { saved: true };
}
