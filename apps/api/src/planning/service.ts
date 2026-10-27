import { OllamaPlanner, PlannerError } from "@drishya/ai";
import {
  type PlanRequest,
  type ProjectDetail,
  type OutlineUpdate,
  projectSchema,
  savedChapterSchema,
} from "@drishya/contracts";
import { chapter, project } from "@drishya/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../database";
import { env } from "../env";
import { HttpError } from "../http-error";
import { enqueue } from "../jobs/queue";
import { checkpoint, jobFence } from "../jobs/context";

const provider = new OllamaPlanner({
  baseURL: env.OLLAMA_BASE_URL,
  model: env.OLLAMA_MODEL,
  timeoutMs: env.OLLAMA_TIMEOUT_MS,
});

function serialize(record: typeof project.$inferSelect) {
  return projectSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

async function run(record: typeof project.$inferSelect, signal: AbortSignal) {
  try {
    const plan = await provider.plan(record.request, {
      signal,
      onRepair: async () => {
        await checkpoint("Repairing outline", 35);
        await db
          .update(project)
          .set({ stage: "repairing", updatedAt: new Date() })
          .where(and(eq(project.id, record.id), jobFence()));
      },
    });
    const { chapters, ...scope } = plan;
    await checkpoint("Saving outline", 85);
    await db.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.id, record.id), jobFence()))
        .for("update");
      if (!owned) throw new Error("Generation lease was lost.");
      if (signal.aborted)
        throw new PlannerError(
          "INTERRUPTED",
          "Planning was interrupted. Retry this project.",
        );
      if (chapters.length)
        await tx.insert(chapter).values(
          chapters.map((item, position) => ({
            ...item,
            projectId: record.id,
            position,
          })),
        );
      await tx
        .update(project)
        .set({
          title: plan.title,
          scope,
          status: plan.decision === "clarify" ? "needs_clarification" : "ready",
          stage: null,
          revision: sql`${project.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(project.id, record.id), jobFence()));
    });
  } catch (error) {
    const failure =
      error instanceof PlannerError
        ? error
        : new PlannerError(
            "PLANNING_FAILED",
            "The outline could not be saved. Check the database connection and retry this project.",
          );
    try {
      await db
        .update(project)
        .set({
          status: "failed",
          stage: null,
          errorCode: failure.code,
          errorMessage: failure.message,
          revision: sql`${project.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(project.id, record.id), jobFence()));
    } catch {
      // Never log prompts, credentials, database URLs or raw driver errors.
      console.error(
        `Unable to persist planning failure for project ${record.id}.`,
      );
    }
    throw error;
  }
}

export async function listProjects(userId: string) {
  const records = await db
    .select()
    .from(project)
    .where(eq(project.userId, userId))
    .orderBy(desc(project.updatedAt))
    .limit(40);
  return { projects: records.map(serialize) };
}

export async function getProject(
  userId: string,
  id: string,
): Promise<ProjectDetail> {
  const [record] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)));
  if (!record) throw new HttpError(404, "Project not found.");
  const chapters = await db
    .select()
    .from(chapter)
    .where(eq(chapter.projectId, id))
    .orderBy(asc(chapter.position));
  return {
    project: serialize(record),
    chapters: chapters.map(({ projectId: _projectId, ...item }) =>
      savedChapterSchema.parse(item),
    ),
  };
}

export async function createProject(userId: string, request: PlanRequest) {
  const record = await db.transaction(async (tx) => {
    const [record] = await tx
      .insert(project)
      .values({
        userId,
        request,
        title: request.topic.slice(0, 120),
        model: provider.model,
        stage: "assessing",
      })
      .returning();
    if (!record) throw new HttpError(500, "Could not create your project.");
    await enqueue(tx, {
      userId,
      projectId: record.id,
      kind: "plan",
      resourceId: record.id,
    });
    return record;
  });
  return { project: serialize(record), chapters: [] };
}

export async function retryProject(
  userId: string,
  id: string,
  clarification?: string,
) {
  const record = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(project)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .for("update");
    if (!current) throw new HttpError(404, "Project not found.");
    if (current.status !== "failed" && current.status !== "needs_clarification")
      throw new HttpError(
        409,
        "This project is already planning or has a saved outline.",
      );
    if (current.status === "needs_clarification" && !clarification)
      throw new HttpError(400, "Answer the clarification before continuing.");
    const [updated] = await tx
      .update(project)
      .set({
        request: {
          ...current.request,
          ...(clarification ? { clarification } : {}),
        },
        status: "planning",
        stage: "assessing",
        scope: null,
        errorCode: null,
        errorMessage: null,
        model: provider.model,
        revision: sql`${project.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(project.id, id))
      .returning();
    if (!updated) throw new HttpError(500, "Could not restart planning.");
    await enqueue(tx, { userId, projectId: id, kind: "plan", resourceId: id });
    return updated;
  });
  if (!record) throw new HttpError(500, "Could not restart planning.");

  return { project: serialize(record), chapters: [] };
}

export async function saveOutline(
  userId: string,
  id: string,
  input: OutlineUpdate,
) {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(project)
      .where(and(eq(project.id, id), eq(project.userId, userId)))
      .for("update");
    if (!current) throw new HttpError(404, "Project not found.");
    if (current.status !== "ready")
      throw new HttpError(
        409,
        "Wait until the outline is ready before editing.",
      );
    if (current.revision !== input.revision)
      throw new HttpError(
        409,
        "This outline changed in another tab. Reopen the project to load the latest version.",
        "STALE_OUTLINE",
      );
    const existing = await tx
      .select({ id: chapter.id })
      .from(chapter)
      .where(eq(chapter.projectId, id));
    const known = new Set(existing.map((item) => item.id));
    if (
      known.size !== input.chapters.length ||
      input.chapters.some((item) => !known.has(item.id))
    )
      throw new HttpError(400, "Save all existing chapters exactly once.");
    if (
      input.chapters.some(
        (item) =>
          item.estimatedDurationSeconds > current.request.targetDurationSeconds,
      )
    )
      throw new HttpError(
        400,
        "Chapter estimates must fit your target duration.",
      );
    if (
      new Set(input.chapters.map((item) => item.title.toLowerCase())).size !==
      input.chapters.length
    )
      throw new HttpError(400, "Use a distinct title for each chapter.");
    // Clear the selection first to preserve the database's one-selection constraint.
    await tx
      .update(chapter)
      .set({ isSelected: false })
      .where(eq(chapter.projectId, id));
    for (const [position, item] of input.chapters.entries()) {
      await tx
        .update(chapter)
        .set({
          title: item.title,
          objective: item.objective,
          prerequisites: item.prerequisites,
          estimatedDurationSeconds: item.estimatedDurationSeconds,
          position,
          isSelected: item.id === input.selectedChapterId,
        })
        .where(and(eq(chapter.id, item.id), eq(chapter.projectId, id)));
    }
    await tx
      .update(project)
      .set({ revision: sql`${project.revision} + 1`, updatedAt: new Date() })
      .where(eq(project.id, id));
  });
  return getProject(userId, id);
}

export async function executePlanning(id: string, signal: AbortSignal) {
  const [record] = await db.select().from(project).where(eq(project.id, id));
  if (!record) throw new HttpError(404, "Project no longer exists.");
  if (record.status === "ready" || record.status === "needs_clarification")
    return;
  await checkpoint("Assessing topic", 5);
  await db
    .update(project)
    .set({
      status: "planning",
      stage: "assessing",
      errorCode: null,
      errorMessage: null,
    })
    .where(and(eq(project.id, id), jobFence()));
  await run(record, signal);
}
