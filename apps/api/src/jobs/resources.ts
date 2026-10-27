import {
  type generationJob,
  lessonVersion,
  project,
  videoExport,
  voiceover,
} from "@drishya/db/schema";
import { and, eq, ne } from "drizzle-orm";
import type { db } from "../database";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function resourceFailure(
  tx: Tx,
  job: typeof generationJob.$inferSelect,
  message: string,
  cancelled = false,
) {
  switch (job.kind) {
    case "plan":
      await tx
        .update(project)
        .set({
          status: "failed",
          stage: null,
          errorCode: cancelled ? "CANCELLED" : "GENERATION_FAILED",
          errorMessage: message,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(project.id, job.resourceId),
            ne(project.status, "ready"),
            ne(project.status, "needs_clarification"),
          ),
        );
      break;
    case "storyboard":
      await tx
        .update(lessonVersion)
        .set({ status: "failed", errorMessage: message })
        .where(
          and(
            eq(lessonVersion.id, job.resourceId),
            ne(lessonVersion.status, "ready"),
          ),
        );
      break;
    case "voiceover":
      await tx
        .update(voiceover)
        .set({ status: "failed", errorMessage: message })
        .where(
          and(eq(voiceover.id, job.resourceId), ne(voiceover.status, "ready")),
        );
      break;
    case "video":
      await tx
        .update(videoExport)
        .set({ status: "failed", errorMessage: message })
        .where(
          and(
            eq(videoExport.id, job.resourceId),
            ne(videoExport.status, "ready"),
          ),
        );
      break;
  }
}
export async function resourcePending(
  tx: Tx,
  job: typeof generationJob.$inferSelect,
) {
  switch (job.kind) {
    case "plan":
      await tx
        .update(project)
        .set({
          status: "planning",
          stage: "assessing",
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(project.id, job.resourceId),
            ne(project.status, "ready"),
            ne(project.status, "needs_clarification"),
          ),
        );
      break;
    case "storyboard":
      await tx
        .update(lessonVersion)
        .set({ status: "drafting", errorMessage: null })
        .where(
          and(
            eq(lessonVersion.id, job.resourceId),
            ne(lessonVersion.status, "ready"),
          ),
        );
      break;
    case "voiceover":
      await tx
        .update(voiceover)
        .set({
          status: job.payload.fitting ? "fitting" : "synthesizing",
          errorMessage: null,
        })
        .where(
          and(eq(voiceover.id, job.resourceId), ne(voiceover.status, "ready")),
        );
      break;
    case "video":
      await tx
        .update(videoExport)
        .set({ status: "preparing", errorMessage: null })
        .where(
          and(
            eq(videoExport.id, job.resourceId),
            ne(videoExport.status, "ready"),
          ),
        );
      break;
  }
}
