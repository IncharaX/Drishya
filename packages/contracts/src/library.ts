import { z } from "zod";
export const libraryItemSchema = z.object({
  id: z.string(),
  projectId: z.uuid(),
  projectTitle: z.string(),
  chapterId: z.uuid(),
  chapterTitle: z.string(),
  versionId: z.uuid(),
  version: z.number(),
  storyboardStatus: z.string(),
  takeId: z.uuid().nullable(),
  language: z.string().nullable(),
  voiceLabel: z.string().nullable(),
  narrationStatus: z.string().nullable(),
  exportId: z.uuid().nullable(),
  exportStatus: z.string().nullable(),
  duration: z.number().nullable(),
  createdAt: z.iso.datetime(),
});
export const librarySchema = z.object({
  items: z.array(libraryItemSchema),
  hasMore: z.boolean(),
});
export type LibraryItem = z.infer<typeof libraryItemSchema>;
