import path from "node:path";
import {
  chapterDecisionSchema,
  createConversationSchema,
  creationSettingsSchema,
  followupSchema,
  generateExplanationSchema,
  motionPlanSchema,
  questionAnswerSchema,
  videoLibrarySchema,
} from "@drishya/contracts";
import {
  chapter,
  conversation,
  explanationRevision,
  lessonVersion,
  project,
  videoExport,
  voiceover,
} from "@drishya/db/schema";
import { and, desc, eq, exists, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Router } from "express";
import { z } from "zod";
import { db } from "../database";
import { env } from "../env";
import { HttpError } from "../http-error";
import { revisionDirectory } from "./render";
import {
  activateRevision,
  answer,
  cancelConversation,
  createConversation,
  decide,
  detail,
  followup,
  generate,
  listConversations,
  ownedChat,
  retryRevision,
  savePreferences,
  serializeRevision,
} from "./service";
import { ensureSoundtrack } from "./sound";
export const chatRouter = Router();
const readyPart = alias(explanationRevision, "ready_part");
const id = (value: unknown) => z.uuid().parse(value);
chatRouter.get("/", async (req, res) => {
  const input = z
    .object({
      offset: z.coerce.number().int().min(0).max(100000).default(0),
      q: z.string().max(200).default(""),
    })
    .parse(req.query);
  res.json(await listConversations(res.locals.userId, input.offset, input.q));
});
chatRouter.post("/", async (req, res) => {
  const input = createConversationSchema.parse(req.body);
  res
    .status(201)
    .json(
      await createConversation(
        res.locals.userId,
        input.prompt,
        input.requestId,
        input.attachmentIds,
      ),
    );
});
chatRouter.get("/library", async (req, res) => {
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .default(0)
    .parse(req.query.offset);
  const rows = await db
    .selectDistinctOn([conversation.id], {
      chat: conversation,
      revision: explanationRevision,
    })
    .from(conversation)
    .innerJoin(
      explanationRevision,
      eq(conversation.id, explanationRevision.conversationId),
    )
    .where(
      and(
        eq(conversation.userId, res.locals.userId),
        or(
          eq(explanationRevision.status, "ready"),
          and(
            inArray(explanationRevision.status, ["partial", "generating"]),
            exists(
              db
                .select({ id: readyPart.id })
                .from(readyPart)
                .where(
                  and(
                    eq(readyPart.collectionId, explanationRevision.id),
                    eq(readyPart.status, "ready"),
                  ),
                ),
            ),
          ),
        ),
        isNull(explanationRevision.collectionId),
      ),
    )
    .orderBy(conversation.id, desc(explanationRevision.version))
    .limit(500);
  const items: z.infer<typeof videoLibrarySchema>["items"] = [];
  const files = (chatId: string, revisionId: string, file: string) =>
    `/api/projects/chats/${chatId}/revisions/${revisionId}/${file}`;
  for (const { chat, revision } of rows) {
    const parts = revision.outline.length
      ? await db
          .select()
          .from(explanationRevision)
          .where(eq(explanationRevision.collectionId, revision.id))
          .orderBy(explanationRevision.partIndex)
      : [];
    const first = parts.find((part) => part.status === "ready");
    if (parts.length && !first) continue;
    if (!parts.length && revision.status !== "ready") continue;
    items.push({
      id: revision.id,
      title: revision.title,
      conversationId: chat.id,
      revisionId: revision.id,
      kind: parts.length ? "collection" : "video",
      duration: revision.duration === null ? null : revision.duration / 1000,
      posterUrl: `${files(chat.id, first?.id ?? revision.id, "poster.jpg")}?v=${(first ?? revision).updatedAt.getTime()}`,
      videoUrl: parts.length ? null : `${files(chat.id, revision.id, "video.mp4")}?v=${revision.updatedAt.getTime()}`,
      captionsUrl: parts.length
        ? null
        : files(chat.id, revision.id, "captions.vtt"),
      parts: parts.map((part) => ({ ...serializeRevision(part), plan: null })),
      createdAt: revision.createdAt.toISOString(),
    });
  }
  const legacy = await db
    .selectDistinctOn([videoExport.voiceoverId], {
      record: videoExport,
      projectId: project.id,
      chapterId: chapter.id,
      versionId: lessonVersion.id,
      takeId: voiceover.id,
      title: chapter.title,
    })
    .from(videoExport)
    .innerJoin(voiceover, eq(videoExport.voiceoverId, voiceover.id))
    .innerJoin(lessonVersion, eq(voiceover.lessonVersionId, lessonVersion.id))
    .innerJoin(chapter, eq(lessonVersion.chapterId, chapter.id))
    .innerJoin(project, eq(chapter.projectId, project.id))
    .where(
      and(
        eq(project.userId, res.locals.userId),
        eq(videoExport.status, "ready"),
      ),
    )
    .orderBy(videoExport.voiceoverId, desc(videoExport.createdAt))
    .limit(500);
  for (const item of legacy) {
    const base = `/api/projects/${item.projectId}/chapters/${item.chapterId}/storyboards/${item.versionId}/voiceovers/${item.takeId}/exports/${item.record.id}`;
    items.push({
      id: item.record.id,
      title: item.title,
      conversationId: null,
      revisionId: null,
      kind: "legacy",
      duration: item.record.timeline?.duration ?? null,
      posterUrl: null,
      videoUrl: `${base}/video.mp4`,
      captionsUrl: `${base}/captions.vtt`,
      parts: [],
      createdAt: item.record.createdAt.toISOString(),
    });
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(
    videoLibrarySchema.parse({
      items: items.slice(offset, offset + 40),
      hasMore: items.length > offset + 40,
    }),
  );
});
chatRouter.get("/:chatId", async (req, res) =>
  res.json(await detail(res.locals.userId, id(req.params.chatId))),
);
chatRouter.patch("/:chatId/preferences", async (req, res) => {
  const input = z
    .object({ settings: creationSettingsSchema })
    .strict()
    .parse(req.body);
  res.json(
    await savePreferences(
      res.locals.userId,
      id(req.params.chatId),
      input.settings,
    ),
  );
});
chatRouter.post("/:chatId/generate", async (req, res) => {
  const input = generateExplanationSchema.parse(req.body);
  res
    .status(202)
    .json(
      await generate(
        res.locals.userId,
        id(req.params.chatId),
        input.settings,
        input.requestId,
      ),
    );
});
chatRouter.post("/:chatId/messages", async (req, res) =>
  res
    .status(202)
    .json(
      await followup(
        res.locals.userId,
        id(req.params.chatId),
        followupSchema.parse(req.body),
      ),
    ),
);
chatRouter.post("/:chatId/chapters", async (req, res) => {
  const input = chapterDecisionSchema.parse(req.body);
  res
    .status(202)
    .json(
      await decide(
        res.locals.userId,
        id(req.params.chatId),
        input.revisionId,
        input.choice,
        input.requestId,
      ),
    );
});
chatRouter.post("/:chatId/answer", async (req, res) => {
  const input = questionAnswerSchema.parse(req.body);
  res
    .status(202)
    .json(
      await answer(
        res.locals.userId,
        id(req.params.chatId),
        input.revisionId,
        input.answer,
        input.requestId,
      ),
    );
});
chatRouter.post("/:chatId/cancel", async (req, res) => {
  z.object({}).strict().parse(req.body);
  res.json(await cancelConversation(res.locals.userId, id(req.params.chatId)));
});
chatRouter.post("/:chatId/retry", async (req, res) => {
  const input = z.object({ revisionId: z.uuid() }).strict().parse(req.body);
  res
    .status(202)
    .json(
      await retryRevision(
        res.locals.userId,
        id(req.params.chatId),
        input.revisionId,
      ),
    );
});
chatRouter.post("/:chatId/versions", async (req, res) => {
  const input = z.object({ revisionId: z.uuid() }).strict().parse(req.body);
  res.json(
    await activateRevision(
      res.locals.userId,
      id(req.params.chatId),
      input.revisionId,
    ),
  );
});
chatRouter.get(
  "/:chatId/revisions/:revisionId/audio/:beatId",
  async (req, res, next) => {
    await ownedChat(res.locals.userId, id(req.params.chatId));
    const [row] = await db
      .select()
      .from(explanationRevision)
      .where(
        and(
          eq(explanationRevision.id, id(req.params.revisionId)),
          eq(explanationRevision.conversationId, id(req.params.chatId)),
        ),
      );
    if (req.params.beatId === "soundtrack") {
      if (!row?.plan || !["rendering", "ready"].includes(row.status))
        throw new HttpError(404, "The soundtrack is not ready.");
      const soundtrack = await ensureSoundtrack(
        motionPlanSchema.parse(row.plan),
      );
      if (!soundtrack)
        throw new HttpError(404, "This video has no soundtrack.");
      res.type("audio/wav").sendFile(soundtrack, { cacheControl: false });
      return;
    }
    const beat = row?.plan?.beats.find((beat) => beat.id === req.params.beatId);
    if (!beat?.audioKey)
      throw new HttpError(404, "This narration section is not ready.");
    res
      .type("audio/wav")
      .sendFile(
        path.resolve(env.MEDIA_ROOT, "audio", `${beat.audioKey}.wav`),
        { cacheControl: false },
        (error) => {
          if (error && !res.headersSent)
            next(
              new HttpError(
                404,
                "The narration asset is missing. Retry generation.",
              ),
            );
        },
      );
  },
);
chatRouter.get(
  "/:chatId/revisions/:revisionId/:file",
  async (req, res, next) => {
    await ownedChat(res.locals.userId, id(req.params.chatId));
    const revisionId = id(req.params.revisionId),
      file = z
        .enum(["video.mp4", "poster.jpg", "captions.vtt", "captions.srt"])
        .parse(req.params.file);
    const [row] = await db
      .select()
      .from(explanationRevision)
      .where(
        and(
          eq(explanationRevision.id, revisionId),
          eq(explanationRevision.conversationId, id(req.params.chatId)),
        ),
      );
    if (row?.status !== "ready")
      throw new HttpError(409, "This video is not ready to download.");
    const types = {
      "video.mp4": "video/mp4",
      "poster.jpg": "image/jpeg",
      "captions.vtt": "text/vtt; charset=utf-8",
      "captions.srt": "application/x-subrip",
    };
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.type(types[file]);
    if (req.query.download === "1")
      res.attachment(
        `drishya-${row.title.replace(/[^a-zA-Z0-9_-]/gu, "-").slice(0, 60)}-${file}`,
      );
    res.sendFile(
      path.join(revisionDirectory(revisionId), file),
      { cacheControl: false },
      (error) => {
        if (error && !res.headersSent)
          next(
            new HttpError(
              404,
              "The video file is missing. Retry this generation.",
            ),
          );
      },
    );
  },
);
