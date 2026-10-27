import { librarySchema } from "@drishya/contracts";
import {
  chapter,
  lessonVersion,
  project,
  videoExport,
  voiceover,
} from "@drishya/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../database";
export const libraryRouter = Router();
libraryRouter.get("/", async (req, res) => {
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(100_000)
    .default(0)
    .parse(req.query.offset);
  const records = await db
    .select({
      projectId: project.id,
      projectTitle: project.title,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      versionId: lessonVersion.id,
      version: lessonVersion.version,
      storyboardStatus: lessonVersion.status,
      takeId: voiceover.id,
      language: voiceover.language,
      voiceLabel: voiceover.voiceLabel,
      narrationStatus: voiceover.status,
      exportId: videoExport.id,
      exportStatus: videoExport.status,
      duration: sql<
        number | null
      >`(${videoExport.timeline}->>'duration')::float`,
      createdAt: sql<Date>`coalesce(${videoExport.createdAt},${voiceover.createdAt},${lessonVersion.createdAt})`,
    })
    .from(lessonVersion)
    .innerJoin(chapter, eq(lessonVersion.chapterId, chapter.id))
    .innerJoin(project, eq(chapter.projectId, project.id))
    .leftJoin(voiceover, eq(voiceover.lessonVersionId, lessonVersion.id))
    .leftJoin(videoExport, eq(videoExport.voiceoverId, voiceover.id))
    .where(eq(project.userId, res.locals.userId))
    .orderBy(
      desc(
        sql`coalesce(${videoExport.createdAt},${voiceover.createdAt},${lessonVersion.createdAt})`,
      ),
      desc(lessonVersion.id),
      desc(voiceover.id),
      desc(videoExport.id),
    )
    .limit(51)
    .offset(offset);
  res.json(
    librarySchema.parse({
      items: records.slice(0, 50).map((row) => ({
        ...row,
        id: row.exportId ?? row.takeId ?? row.versionId,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
      hasMore: records.length > 50,
    }),
  );
});
