import {
  explanationRevision,
  videoLearning,
  type generationJob,
  lessonVersion,
  project,
  videoExport,
  voiceover,
} from "@drishya/db/schema";
import { and, eq, ne } from "drizzle-orm";
import type { db } from "../database";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function reconcileCollection(tx: Tx, id: string): Promise<void> {
  const parts = await tx
    .select()
    .from(explanationRevision)
    .where(eq(explanationRevision.collectionId, id));
  if (!parts.length) return;
  const complete = parts.filter((part) => part.status === "ready"),
    active = parts.some((part) =>
      ["queued", "planning", "generating", "narrating", "rendering"].includes(
        part.status,
      ),
    ),
    waiting = parts.some((part) =>
      ["awaiting_input", "awaiting_approval"].includes(part.status),
    );
  const [parent] = await tx
    .update(explanationRevision)
    .set({
      status:
        complete.length === parts.length
          ? "ready"
          : active || waiting
            ? "generating"
            : complete.length
              ? "partial"
              : parts.every((part) => part.status === "cancelled")
                ? "cancelled"
                : "failed",
      progress: Math.floor((complete.length / parts.length) * 100),
      stage:
        complete.length === parts.length
          ? "All chapters are ready"
          : `${complete.length} of ${parts.length} chapters ready`,
      duration: complete.reduce((sum, part) => sum + (part.duration ?? 0), 0),
      updatedAt: new Date(),
    })
    .where(eq(explanationRevision.id, id))
    .returning();
  if (parent?.collectionId) await reconcileCollection(tx, parent.collectionId);
}
export async function resourceFailure(
  tx: Tx,
  job: typeof generationJob.$inferSelect,
  message: string,
  cancelled = false,
) {
  switch (job.kind) {
    case "learning":
      await tx
        .update(videoLearning)
        .set({ status: "failed", error: message, updatedAt: new Date() })
        .where(eq(videoLearning.id, job.resourceId));
      break;
    case "explanation": {
      const updated = await tx
        .update(explanationRevision)
        .set({
          status: cancelled ? "cancelled" : "failed",
          stage: cancelled ? "Cancelled" : "Generation needs attention",
          errorMessage: message,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(explanationRevision.id, job.resourceId),
            ne(explanationRevision.status, "ready"),
          ),
        )
        .returning();
      if (updated[0]?.collectionId)
        await reconcileCollection(tx, updated[0].collectionId);
      break;
    }
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
    case "learning":
      await tx
        .update(videoLearning)
        .set({ status: "queued", error: null, updatedAt: new Date() })
        .where(eq(videoLearning.id, job.resourceId));
      break;
    case "explanation": {
      const updated = await tx
        .update(explanationRevision)
        .set({
          status: "queued",
          stage: "Queued",
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(explanationRevision.id, job.resourceId),
            ne(explanationRevision.status, "ready"),
          ),
        )
        .returning();
      if (updated[0]?.collectionId)
        await reconcileCollection(tx, updated[0].collectionId);
      break;
    }
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
