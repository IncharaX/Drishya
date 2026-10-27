import { Router } from "express";
import { z } from "zod";
import { cancelJob, listJobs, retryJob } from "./queue";
export const jobsRouter = Router();
jobsRouter.get("/", async (req, res) =>
  res.json(
    await listJobs(
      res.locals.userId,
      z.uuid().optional().parse(req.query.projectId),
    ),
  ),
);
jobsRouter.post("/:jobId/cancel", async (req, res) => {
  z.object({}).strict().parse(req.body);
  res.json(
    await cancelJob(res.locals.userId, z.uuid().parse(req.params.jobId)),
  );
});

jobsRouter.post("/:jobId/retry", async (req, res) => {
  z.object({}).strict().parse(req.body);
  res
    .status(202)
    .json(await retryJob(res.locals.userId, z.uuid().parse(req.params.jobId)));
});
