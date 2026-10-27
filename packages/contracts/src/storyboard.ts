import { z } from "zod";
import { chapterContentSchema, planRequestSchema } from "./planning";

const sceneId = z.string().regex(/^[a-z][a-z0-9_-]{0,24}$/);
const common = {
  id: sceneId,
  title: z.string().trim().min(2).max(80),
  narration: z.string().trim().min(10).max(700),
  sourceIds: z.array(z.string().min(1).max(60)).max(3),
};
export const titleSceneSchema = z
  .object({
    ...common,
    type: z.literal("title"),
    subtitle: z.string().trim().min(1).max(150),
    bullets: z.array(z.string().trim().min(1).max(100)).max(3),
  })
  .strict();
export const diagramSceneSchema = z
  .object({
    ...common,
    type: z.literal("diagram"),
    layout: z.enum(["flow", "cycle"]),
    nodes: z
      .array(
        z
          .object({ id: sceneId, label: z.string().trim().min(1).max(48) })
          .strict(),
      )
      .min(2)
      .max(5),
    edges: z
      .array(
        z
          .object({
            from: sceneId,
            to: sceneId,
            label: z.string().trim().min(1).max(24),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    caption: z.string().trim().min(1).max(150),
  })
  .strict();
export const codeSceneSchema = z
  .object({
    ...common,
    type: z.literal("code"),
    language: z.enum([
      "python",
      "javascript",
      "typescript",
      "sql",
      "html",
      "css",
      "text",
    ]),
    code: z.string().min(1).max(1200),
    focusLines: z.array(z.number().int().min(1).max(14)).min(1).max(6),
    caption: z.string().trim().min(1).max(150),
  })
  .strict();
export const sceneSchema = z.discriminatedUnion("type", [
  titleSceneSchema,
  diagramSceneSchema,
  codeSceneSchema,
]);
export const storyboardSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    learningObjective: z.string().trim().min(10).max(500),
    scenes: z.array(sceneSchema).min(3).max(6),
  })
  .strict();
export const referenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.url(),
  notes: z.array(z.string()),
});
export const lessonInputSchema = z.object({
  request: planRequestSchema,
  interpretedSubject: z.string(),
  chapter: chapterContentSchema,
});
export const lessonVersionSchema = z.object({
  id: z.uuid(),
  chapterId: z.uuid(),
  version: z.number().int().positive(),
  parentId: z.uuid().nullable(),
  origin: z.enum(["generated", "edited"]),
  status: z.enum(["drafting", "repairing", "ready", "failed"]),
  model: z.string(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const lessonDetailSchema = lessonVersionSchema.extend({
  input: lessonInputSchema,
  content: storyboardSchema.nullable(),
  references: z.array(referenceSchema),
  isStale: z.boolean(),
});
export const lessonListSchema = z.object({
  versions: z.array(lessonVersionSchema),
});
export const storyboardSaveSchema = z
  .object({ content: storyboardSchema })
  .strict();
export type Scene = z.infer<typeof sceneSchema>;
export type Storyboard = z.infer<typeof storyboardSchema>;
export type LessonInput = z.infer<typeof lessonInputSchema>;
export type LessonReference = z.infer<typeof referenceSchema>;
export type LessonVersion = z.infer<typeof lessonVersionSchema>;
export type LessonDetail = z.infer<typeof lessonDetailSchema>;

export function narrationWords(content: Storyboard) {
  return content.scenes.reduce(
    (sum, scene) =>
      sum + scene.narration.trim().split(/\s+/u).filter(Boolean).length,
    0,
  );
}
export function storyboardIssues(
  content: Storyboard,
  duration: number,
  references: LessonReference[],
) {
  const issues: string[] = [];
  const known = new Set(references.map((item) => item.id));
  if (content.scenes[0]?.type !== "title")
    issues.push("The first scene must be a title scene.");
  if (!content.scenes.some((scene) => scene.type === "diagram"))
    issues.push("Include at least one explanatory diagram.");
  if (
    new Set(content.scenes.map((scene) => scene.id)).size !==
    content.scenes.length
  )
    issues.push("Scene IDs must be unique.");
  if (narrationWords(content) > duration * 2)
    issues.push(
      `Keep total narration at or below ${duration * 2} words for this target. Shorten sentences, not the learning objective.`,
    );
  for (const scene of content.scenes) {
    if (scene.sourceIds.some((id) => !known.has(id)))
      issues.push(`${scene.id}: cite only provided reference IDs.`);
    if (new Set(scene.sourceIds).size !== scene.sourceIds.length)
      issues.push(`${scene.id}: remove duplicate reference IDs.`);
    if (scene.type === "diagram") {
      const ids = new Set(scene.nodes.map((node) => node.id));
      if (ids.size !== scene.nodes.length)
        issues.push(`${scene.id}: node IDs must be unique.`);
      for (const edge of scene.edges) {
        if (!ids.has(edge.from) || !ids.has(edge.to))
          issues.push(
            `${scene.id}: arrow ${edge.from} → ${edge.to} has an unknown endpoint. Allowed node IDs: ${[...ids].join(", ")}.`,
          );
        else if (edge.from === edge.to)
          issues.push(
            `${scene.id}: remove self-arrow ${edge.from} → ${edge.to}; connect distinct nodes.`,
          );
      }
      if (
        new Set(scene.edges.map((edge) => `${edge.from}:${edge.to}`)).size !==
        scene.edges.length
      )
        issues.push(`${scene.id}: do not duplicate arrows.`);
    }
    if (scene.type === "code") {
      const lines = scene.code.split("\n");
      if (lines.length > 14 || lines.some((line) => line.length > 90))
        issues.push(
          `${scene.id}: code must fit 14 lines, at most 90 characters per line.`,
        );
      if (
        scene.focusLines.some((line) => line > lines.length) ||
        new Set(scene.focusLines).size !== scene.focusLines.length
      )
        issues.push(`${scene.id}: highlight distinct, existing code lines.`);
    }
  }
  return issues;
}
