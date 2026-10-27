import type { HealthResponse } from "@drishya/contracts";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { auth } from "./auth";
import { HttpError } from "./http-error";
import { projectRouter } from "./planning/routes";
import { ZodError } from "zod";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
// Better Auth must read the raw request stream before Express's JSON parser.
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  const health: HealthResponse = {
    status: "ok",
    service: "drishya-api",
    timestamp: new Date().toISOString(),
  };
  res.json(health);
});

app.get("/api/me", async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session) {
    res.status(401).json({ error: "Sign in to continue" });
    return;
  }
  res.json({ user: session.user });
});

app.use("/api/projects", projectRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const onError: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    if (error.status === 429) res.setHeader("Retry-After", "15");
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: error.issues
        .map((issue) => `${issue.path.join(".") || "Input"}: ${issue.message}`)
        .join(" "),
      code: "INVALID_INPUT",
    });
    return;
  }
  const badJson = error instanceof SyntaxError && "body" in error;
  res
    .status(badJson ? 400 : 500)
    .json({ error: badJson ? "Invalid JSON body" : "Internal server error" });
};
app.use(onError);
