import { z } from "zod";
export const jobKindSchema = z.enum([
  "plan",
  "storyboard",
  "voiceover",
  "video",
  "explanation",
]);
export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "retrying",
  "completed",
  "failed",
  "cancelled",
]);
export const generationJobSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  chapterId: z.uuid().nullable(),
  kind: jobKindSchema,
  resourceId: z.uuid(),
  status: jobStatusSchema,
  stage: z.string(),
  progress: z.number().min(0).max(100),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  errorMessage: z.string().nullable(),
  cancelRequested: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type GenerationJob = z.infer<typeof generationJobSchema>;
export type JobKind = z.infer<typeof jobKindSchema>;
export const jobListSchema = z.object({
  jobs: z.array(generationJobSchema),
  workerOnline: z.boolean(),
});
