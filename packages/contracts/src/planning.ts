import { z } from "zod";

export const MAX_CHAPTERS = 8;
// Marathi remains parseable only to preserve existing projects and saved takes.
export const languageSchema = z.enum(["en", "hi", "kn", "te", "mr"]);
export const narrationLanguageSchema = z.enum(["en", "hi", "kn", "te"]);
export const levelSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const planRequestSchema = z
  .object({
    topic: z.string().trim().min(2).max(500),
    level: levelSchema.default("beginner"),
    language: languageSchema.default("en"),
    targetDurationSeconds: z.number().int().min(30).max(90).default(60),
    approach: z.enum(["lesson", "overview"]).default("lesson"),
    clarification: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const chapterContentSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    objective: z.string().trim().min(10).max(500),
    estimatedDurationSeconds: z.number().int().min(30).max(90),
    prerequisites: z.array(z.string().trim().min(1).max(160)).max(5),
  })
  .strict();

// Keep the model's format simple. Cross-field rules are enforced separately.
export const scopePlanSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    interpretedSubject: z.string().trim().min(2).max(300),
    decision: z.enum(["single", "chapters", "clarify"]),
    rationale: z.string().trim().min(10).max(1200),
    prerequisites: z.array(z.string().trim().min(1).max(160)).max(5),
    clarification: z
      .object({
        question: z.string().trim().min(5).max(300),
        choices: z.array(z.string().trim().min(1).max(160)).min(2).max(4),
      })
      .strict()
      .nullable(),
    chapters: z.array(chapterContentSchema).max(MAX_CHAPTERS),
  })
  .strict();

export const scopeMetadataSchema = scopePlanSchema.omit({ chapters: true });
export const projectStatusSchema = z.enum([
  "planning",
  "needs_clarification",
  "ready",
  "failed",
]);
export const planningStageSchema = z
  .enum(["assessing", "repairing"])
  .nullable();
export const projectSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  request: planRequestSchema,
  status: projectStatusSchema,
  stage: planningStageSchema,
  scope: scopeMetadataSchema.nullable(),
  model: z.string(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  revision: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const savedChapterSchema = chapterContentSchema.extend({
  id: z.uuid(),
  position: z.number().int().nonnegative(),
  isSelected: z.boolean(),
});
export const projectDetailSchema = z.object({
  project: projectSchema,
  chapters: z.array(savedChapterSchema).max(MAX_CHAPTERS),
});
export const projectListSchema = z.object({ projects: z.array(projectSchema) });
export const outlineUpdateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    chapters: z
      .array(chapterContentSchema.extend({ id: z.uuid() }))
      .min(1)
      .max(MAX_CHAPTERS),
    selectedChapterId: z.uuid().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.chapters.map((chapter) => chapter.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Each chapter must appear once.",
      });
    if (value.selectedChapterId && !ids.includes(value.selectedChapterId))
      ctx.addIssue({
        code: "custom",
        message: "Choose a chapter from this outline.",
      });
  });
export const replanSchema = z
  .object({ clarification: z.string().trim().min(1).max(500).optional() })
  .strict();

export type PlanRequest = z.infer<typeof planRequestSchema>;
export type ScopePlan = z.infer<typeof scopePlanSchema>;
export type ScopeMetadata = z.infer<typeof scopeMetadataSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type PlanningStage = z.infer<typeof planningStageSchema>;
export type Project = z.infer<typeof projectSchema>;
export type SavedChapter = z.infer<typeof savedChapterSchema>;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
export type OutlineUpdate = z.infer<typeof outlineUpdateSchema>;

export function scopeIssues(plan: ScopePlan, request: PlanRequest): string[] {
  const issues: string[] = [];
  if (plan.decision === "clarify") {
    if (!plan.clarification || plan.chapters.length)
      issues.push(
        "A clarification requires a question, choices, and no chapters.",
      );
    if (
      plan.clarification &&
      new Set(plan.clarification.choices).size !==
        plan.clarification.choices.length
    )
      issues.push("Clarification choices must be distinct.");
  } else {
    if (plan.clarification)
      issues.push("A finished outline must have clarification set to null.");
    if (plan.decision === "single" && plan.chapters.length !== 1)
      issues.push("A single lesson needs exactly one chapter.");
    if (plan.decision === "chapters" && plan.chapters.length < 2)
      issues.push("A chapter outline needs at least two chapters.");
    if (
      plan.chapters.some(
        (chapter) =>
          chapter.estimatedDurationSeconds > request.targetDurationSeconds,
      )
    )
      issues.push("Every chapter must fit the requested target duration.");
    if (
      new Set(plan.chapters.map((chapter) => chapter.title.toLocaleLowerCase()))
        .size !== plan.chapters.length
    )
      issues.push("Chapter titles must be distinct.");
  }
  return issues;
}
