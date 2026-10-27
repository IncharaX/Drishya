import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../http-error";
import { exportDirectory } from "./render";
import { getExport, listExports, startExport } from "./service";

export const videoRouter = Router({ mergeParams: true });
const ids = (params: unknown) =>
  z
    .object({
      id: z.uuid(),
      chapterId: z.uuid(),
      versionId: z.uuid(),
      takeId: z.uuid(),
    })
    .parse(params);
videoRouter.get("/", async (req, res) => {
  const p = ids(req.params);
  res.json(
    await listExports(
      res.locals.userId,
      p.id,
      p.chapterId,
      p.versionId,
      p.takeId,
    ),
  );
});
videoRouter.post("/", async (req, res) => {
  const p = ids(req.params);
  z.object({}).strict().parse(req.body);
  res
    .status(202)
    .json(
      await startExport(
        res.locals.userId,
        p.id,
        p.chapterId,
        p.versionId,
        p.takeId,
      ),
    );
});
videoRouter.get("/:exportId/:file", async (req, res, next) => {
  const p = ids(req.params),
    exportId = z.uuid().parse(req.params.exportId);
  const file = z
    .enum(["video.mp4", "captions.vtt", "captions.srt", "manifest.json"])
    .parse(req.params.file);
  const record = await getExport(
    res.locals.userId,
    p.id,
    p.chapterId,
    p.versionId,
    p.takeId,
    exportId,
  );
  if (record.status !== "ready")
    throw new HttpError(409, "This video export is not ready.");
  const types = {
    "video.mp4": "video/mp4",
    "captions.vtt": "text/vtt; charset=utf-8",
    "captions.srt": "application/x-subrip",
    "manifest.json": "application/json",
  };
  res.type(types[file]);
  if (req.query.download === "1")
    res.attachment(`drishya-${exportId.slice(0, 8)}-${file}`);
  res.sendFile(
    path.join(exportDirectory(exportId), file),
    { cacheControl: false },
    (error) => {
      if (error && !res.headersSent)
        next(
          new HttpError(
            404,
            "The export file is missing. Render another export.",
          ),
        );
    },
  );
});
