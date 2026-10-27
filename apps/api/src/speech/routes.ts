import path from "node:path";
import {
  voiceoverRequestSchema,
  voiceoverRevisionSchema,
} from "@drishya/contracts";
import { Router } from "express";
import { z } from "zod";
import { env } from "../env";
import { HttpError } from "../http-error";
import {
  getVoiceover,
  listVoiceovers,
  reviseVoiceover,
  startVoiceover,
} from "./service";

export const voiceoverRouter = Router({ mergeParams: true });
const ids = (params: Record<string, unknown>) =>
  z
    .object({ id: z.uuid(), chapterId: z.uuid(), versionId: z.uuid() })
    .parse(params);
voiceoverRouter.get("/", async (req, res) => {
  const { id, chapterId, versionId } = ids(req.params);
  res.json(await listVoiceovers(res.locals.userId, id, chapterId, versionId));
});
voiceoverRouter.post("/", async (req, res) => {
  const { id, chapterId, versionId } = ids(req.params);
  res
    .status(202)
    .json(
      await startVoiceover(
        res.locals.userId,
        id,
        chapterId,
        versionId,
        voiceoverRequestSchema.parse(req.body),
      ),
    );
});
voiceoverRouter.get("/:takeId", async (req, res) => {
  const { id, chapterId, versionId } = ids(req.params);
  res.json(
    await getVoiceover(
      res.locals.userId,
      id,
      chapterId,
      versionId,
      z.uuid().parse(req.params.takeId),
    ),
  );
});
voiceoverRouter.post("/:takeId/revisions", async (req, res) => {
  const { id, chapterId, versionId } = ids(req.params);
  res
    .status(202)
    .json(
      await reviseVoiceover(
        res.locals.userId,
        id,
        chapterId,
        versionId,
        z.uuid().parse(req.params.takeId),
        voiceoverRevisionSchema.parse(req.body).content,
      ),
    );
});
voiceoverRouter.get("/:takeId/audio/:sceneId", async (req, res, next) => {
  const { id, chapterId, versionId } = ids(req.params);
  const take = await getVoiceover(
    res.locals.userId,
    id,
    chapterId,
    versionId,
    z.uuid().parse(req.params.takeId),
  );
  const asset = take.audio.find((item) => item.sceneId === req.params.sceneId);
  if (!asset) throw new HttpError(404, "Scene audio is not ready.");
  res.type("audio/wav");
  res.sendFile(
    path.resolve(env.MEDIA_ROOT, "audio", `${asset.assetKey}.wav`),
    { cacheControl: false },
    (error) => {
      if (error && !res.headersSent)
        next(
          new HttpError(
            404,
            "Audio file is missing. Generate another take to restore it.",
          ),
        );
    },
  );
});
