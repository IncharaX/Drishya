import {
  outlineUpdateSchema,
  planRequestSchema,
  replanSchema,
} from "@drishya/contracts";
import { fromNodeHeaders } from "better-auth/node";
import { Router } from "express";
import { z } from "zod";
import { auth } from "../auth";
import { env } from "../env";
import { HttpError } from "../http-error";
import { storyboardRouter } from "../storyboards/routes";
import { getVoices } from "../speech/client";
import {
  createProject,
  getProject,
  listProjects,
  retryProject,
  saveOutline,
} from "./service";

import { libraryRouter } from "../library/routes";
import { jobsRouter } from "../jobs/routes";

export const projectRouter = Router();
projectRouter.use(async (req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("origin") !== new URL(env.BETTER_AUTH_URL).origin
  )
    throw new HttpError(403, "Request origin is not allowed.");
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session) throw new HttpError(401, "Sign in to continue.");
  res.locals.userId = session.user.id;
  res.setHeader("Cache-Control", "no-store");
  next();
});
projectRouter.use("/jobs", jobsRouter);
projectRouter.use("/library", libraryRouter);
projectRouter.get("/", async (_req, res) => {
  res.json(await listProjects(res.locals.userId));
});
projectRouter.get("/speech/voices", async (_req, res) => {
  res.json(await getVoices());
});
projectRouter.use("/:id/chapters/:chapterId/storyboards", storyboardRouter);
projectRouter.post("/", async (req, res) => {
  res
    .status(202)
    .json(
      await createProject(res.locals.userId, planRequestSchema.parse(req.body)),
    );
});
projectRouter.get("/:id", async (req, res) => {
  res.json(await getProject(res.locals.userId, z.uuid().parse(req.params.id)));
});
projectRouter.post("/:id/plan", async (req, res) => {
  const { clarification } = replanSchema.parse(req.body);
  res
    .status(202)
    .json(
      await retryProject(
        res.locals.userId,
        z.uuid().parse(req.params.id),
        clarification,
      ),
    );
});
projectRouter.patch("/:id/outline", async (req, res) => {
  res.json(
    await saveOutline(
      res.locals.userId,
      z.uuid().parse(req.params.id),
      outlineUpdateSchema.parse(req.body),
    ),
  );
});
