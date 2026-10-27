import { storyboardSaveSchema } from "@drishya/contracts";
import { Router } from "express";
import { z } from "zod";
import {
  generateStoryboard,
  getVersion,
  listVersions,
  reviseStoryboard,
} from "./service";

// Mounted inside the authenticated, origin-checked project router.
export const storyboardRouter = Router({ mergeParams: true });
const ids = (params: Record<string, unknown>) =>
  z.object({ id: z.uuid(), chapterId: z.uuid() }).parse(params);
storyboardRouter.get("/", async (req, res) => {
  const { id, chapterId } = ids(req.params);
  res.json(await listVersions(res.locals.userId, id, chapterId));
});
storyboardRouter.post("/", async (req, res) => {
  const { id, chapterId } = ids(req.params);
  res
    .status(202)
    .json(await generateStoryboard(res.locals.userId, id, chapterId));
});
storyboardRouter.get("/:versionId", async (req, res) => {
  const { id, chapterId } = ids(req.params);
  res.json(
    await getVersion(
      res.locals.userId,
      id,
      chapterId,
      z.uuid().parse(req.params.versionId),
    ),
  );
});
storyboardRouter.post("/:versionId/revisions", async (req, res) => {
  const { id, chapterId } = ids(req.params);
  const { content } = storyboardSaveSchema.parse(req.body);
  res
    .status(201)
    .json(
      await reviseStoryboard(
        res.locals.userId,
        id,
        chapterId,
        z.uuid().parse(req.params.versionId),
        content,
      ),
    );
});
