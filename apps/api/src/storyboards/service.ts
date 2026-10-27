import { createHash } from "node:crypto";
import { OllamaStoryteller, PlannerError, referencesFor } from "@drishya/ai";
import {
  type LessonInput,
  type Storyboard,
  lessonDetailSchema,
  lessonInputSchema,
  lessonVersionSchema,
  storyboardIssues,
} from "@drishya/contracts";
import { chapter, lessonVersion, project } from "@drishya/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../database";
import { env } from "../env";
import { HttpError } from "../http-error";
import { reserveModel } from "../model-gate";

const provider = new OllamaStoryteller({
  baseURL: env.OLLAMA_BASE_URL,
  model: env.OLLAMA_MODEL,
  timeoutMs: env.OLLAMA_TIMEOUT_MS,
});
let controller: AbortController | null = null;
let activeRun: Promise<void> | null = null;
function fingerprint(input: LessonInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
function metadata(record: typeof lessonVersion.$inferSelect) {
  return lessonVersionSchema.parse({
    ...record,
    createdAt: record.createdAt.toISOString(),
  });
}
async function context(userId: string, projectId: string, chapterId: string) {
  const [record] = await db
    .select({ project, chapter })
    .from(chapter)
    .innerJoin(project, eq(chapter.projectId, project.id))
    .where(
      and(
        eq(chapter.id, chapterId),
        eq(project.id, projectId),
        eq(project.userId, userId),
      ),
    );
  if (!record) throw new HttpError(404, "Chapter not found.");
  const input = lessonInputSchema.parse({
    request: record.project.request,
    interpretedSubject:
      record.project.scope?.interpretedSubject ?? record.project.title,
    chapter: {
      title: record.chapter.title,
      objective: record.chapter.objective,
      prerequisites: record.chapter.prerequisites,
      estimatedDurationSeconds: record.chapter.estimatedDurationSeconds,
    },
  });
  return { ...record, input };
}
export async function listVersions(
  userId: string,
  projectId: string,
  chapterId: string,
) {
  await context(userId, projectId, chapterId);
  const versions = await db
    .select()
    .from(lessonVersion)
    .where(eq(lessonVersion.chapterId, chapterId))
    .orderBy(desc(lessonVersion.version))
    .limit(30);
  return { versions: versions.map(metadata) };
}
export async function getVersion(
  userId: string,
  projectId: string,
  chapterId: string,
  id: string,
) {
  const current = await context(userId, projectId, chapterId);
  const [record] = await db
    .select()
    .from(lessonVersion)
    .where(
      and(eq(lessonVersion.id, id), eq(lessonVersion.chapterId, chapterId)),
    );
  if (!record) throw new HttpError(404, "Storyboard version not found.");
  return lessonDetailSchema.parse({
    ...metadata(record),
    input: record.input,
    content: record.content,
    references: record.references,
    isStale: record.inputFingerprint !== fingerprint(current.input),
  });
}

export async function generateStoryboard(
  userId: string,
  projectId: string,
  chapterId: string,
) {
  const release = reserveModel();
  try {
    const current = await context(userId, projectId, chapterId);
    if (current.project.status !== "ready")
      throw new HttpError(409, "Finish planning this project first.");
    if (!current.chapter.isSelected)
      throw new HttpError(
        409,
        "Select and save this chapter in the outline before generating its script.",
      );
    const references = referencesFor(current.input);
    const record = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ revision: project.revision })
        .from(project)
        .where(and(eq(project.id, projectId), eq(project.userId, userId)))
        .for("update");
      if (!locked || locked.revision !== current.project.revision)
        throw new HttpError(
          409,
          "The outline changed. Reopen this chapter before generating.",
        );
      await tx
        .select({ id: chapter.id })
        .from(chapter)
        .where(eq(chapter.id, chapterId))
        .for("update");
      const [last] = await tx
        .select({ version: lessonVersion.version })
        .from(lessonVersion)
        .where(eq(lessonVersion.chapterId, chapterId))
        .orderBy(desc(lessonVersion.version))
        .limit(1);
      const [created] = await tx
        .insert(lessonVersion)
        .values({
          chapterId,
          version: (last?.version ?? 0) + 1,
          origin: "generated",
          status: "drafting",
          input: current.input,
          inputFingerprint: fingerprint(current.input),
          references,
          model: provider.model,
        })
        .returning();
      if (!created)
        throw new HttpError(500, "Could not create a storyboard version.");
      return created;
    });
    controller = new AbortController();
    activeRun = run(record, controller.signal).finally(() => {
      release();
      activeRun = null;
      controller = null;
    });
    return {
      ...metadata(record),
      input: record.input,
      content: null,
      references,
      isStale: false,
    };
  } catch (error) {
    release();
    throw error;
  }
}

async function run(
  record: typeof lessonVersion.$inferSelect,
  signal: AbortSignal,
) {
  try {
    const content = await provider.storyboard(record.input, record.references, {
      signal,
      onRepair: async () => {
        await db
          .update(lessonVersion)
          .set({ status: "repairing" })
          .where(eq(lessonVersion.id, record.id));
      },
    });
    if (signal.aborted)
      throw new PlannerError(
        "INTERRUPTED",
        "The API restarted. Generate a new storyboard version to continue.",
      );
    await db
      .update(lessonVersion)
      .set({ content, status: "ready" })
      .where(eq(lessonVersion.id, record.id));
  } catch (error) {
    try {
      await db
        .update(lessonVersion)
        .set({
          status: "failed",
          errorMessage:
            error instanceof PlannerError
              ? error.message
              : "The storyboard could not be saved. Check the database connection and generate a new version.",
        })
        .where(eq(lessonVersion.id, record.id));
    } catch {
      console.error(
        `Unable to persist storyboard failure for version ${record.id}.`,
      );
    }
  }
}

export async function reviseStoryboard(
  userId: string,
  projectId: string,
  chapterId: string,
  parentId: string,
  content: Storyboard,
) {
  const current = await context(userId, projectId, chapterId);
  const id = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ revision: project.revision })
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.userId, userId)))
      .for("update");
    if (!locked || locked.revision !== current.project.revision)
      throw new HttpError(
        409,
        "The outline changed. Reopen this chapter before saving.",
      );
    await tx
      .select({ id: chapter.id })
      .from(chapter)
      .where(eq(chapter.id, chapterId))
      .for("update");
    const [parent] = await tx
      .select()
      .from(lessonVersion)
      .where(
        and(
          eq(lessonVersion.id, parentId),
          eq(lessonVersion.chapterId, chapterId),
        ),
      );
    if (!parent || parent.status !== "ready")
      throw new HttpError(404, "Ready storyboard version not found.");
    if (fingerprint(current.input) !== parent.inputFingerprint)
      throw new HttpError(
        409,
        "The chapter changed. Generate a fresh storyboard before editing it.",
      );
    const [latest] = await tx
      .select()
      .from(lessonVersion)
      .where(eq(lessonVersion.chapterId, chapterId))
      .orderBy(desc(lessonVersion.version))
      .limit(1);
    if (latest?.id !== parentId)
      throw new HttpError(
        409,
        "A newer version exists. Open the latest version before editing.",
        "STALE_STORYBOARD",
      );
    const issues = storyboardIssues(
      content,
      parent.input.request.targetDurationSeconds,
      parent.references,
    );
    if (content.learningObjective !== parent.input.chapter.objective)
      issues.push("Keep the saved chapter learning objective unchanged.");
    if (issues.length)
      throw new HttpError(400, issues.join(" "), "INVALID_STORYBOARD");
    const [created] = await tx
      .insert(lessonVersion)
      .values({
        chapterId,
        version: parent.version + 1,
        parentId,
        origin: "edited",
        status: "ready",
        input: parent.input,
        inputFingerprint: parent.inputFingerprint,
        content,
        references: parent.references,
        model: parent.model,
      })
      .returning({ id: lessonVersion.id });
    if (!created)
      throw new HttpError(500, "Could not save your storyboard revision.");
    return created.id;
  });
  return getVersion(userId, projectId, chapterId, id);
}
export async function recoverInterruptedStoryboards() {
  await db
    .update(lessonVersion)
    .set({
      status: "failed",
      errorMessage:
        "The API restarted while drafting. Generate a new version to continue.",
    })
    .where(inArray(lessonVersion.status, ["drafting", "repairing"]));
}
export async function stopStoryboards() {
  controller?.abort();
  await activeRun;
}
