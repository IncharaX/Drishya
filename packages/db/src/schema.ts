import { relations, sql } from "drizzle-orm";
import type {
  PlanRequest,
  ScopeMetadata,
  LessonInput,
  LessonReference,
  Storyboard,
} from "@drishya/contracts";
import type {
  LocalizedStoryboard,
  SceneAudio,
  Timeline,
} from "@drishya/contracts";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Keep Drishya's tables separate from any other application using this database.
export const drishya = pgSchema("drishya");

export const user = drishya.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = drishya.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = drishya.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_id_account_id_idx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = drishya.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const project = drishya.table(
  "project",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    request: jsonb("request").$type<PlanRequest>().notNull(),
    status: text("status", {
      enum: ["planning", "needs_clarification", "ready", "failed"],
    })
      .default("planning")
      .notNull(),
    stage: text("stage", { enum: ["assessing", "repairing"] }),
    scope: jsonb("scope").$type<ScopeMetadata>(),
    model: text("model").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    revision: integer("revision").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("project_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const chapter = drishya.table(
  "chapter",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    prerequisites: jsonb("prerequisites")
      .$type<string[]>()
      .notNull()
      .default([]),
    estimatedDurationSeconds: integer("estimated_duration_seconds").notNull(),
    position: integer("position").notNull(),
    isSelected: boolean("is_selected").default(false).notNull(),
  },
  (table) => [
    index("chapter_project_position_idx").on(table.projectId, table.position),
    uniqueIndex("chapter_one_selection_idx")
      .on(table.projectId)
      .where(sql`${table.isSelected} = true`),
  ],
);

export const lessonVersion = drishya.table(
  "lesson_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chapterId: uuid("chapter_id")
      .notNull()
      .references(() => chapter.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    parentId: uuid("parent_id"),
    origin: text("origin", { enum: ["generated", "edited"] }).notNull(),
    status: text("status", {
      enum: ["drafting", "repairing", "ready", "failed"],
    }).notNull(),
    input: jsonb("input").$type<LessonInput>().notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    content: jsonb("content").$type<Storyboard>(),
    references: jsonb("references")
      .$type<LessonReference[]>()
      .notNull()
      .default([]),
    model: text("model").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("lesson_chapter_version_idx").on(
      table.chapterId,
      table.version,
    ),
  ],
);

export const voiceover = drishya.table(
  "voiceover",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonVersionId: uuid("lesson_version_id")
      .notNull()
      .references(() => lessonVersion.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    language: text("language", {
      enum: ["en", "hi", "kn", "te", "mr"],
    }).notNull(),
    voiceId: text("voice_id").notNull(),
    voiceLabel: text("voice_label").notNull(),
    speed: text("speed").notNull(),
    status: text("status", {
      enum: ["localizing", "fitting", "synthesizing", "ready", "failed"],
    }).notNull(),
    origin: text("origin", { enum: ["generated", "edited"] }).notNull(),
    content: jsonb("content").$type<LocalizedStoryboard>(),
    audio: jsonb("audio").$type<SceneAudio[]>().notNull().default([]),
    totalScenes: integer("total_scenes").notNull(),
    translationModel: text("translation_model").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("voiceover_version_created_idx").on(
      table.lessonVersionId,
      table.createdAt,
    ),
  ],
);

export const videoExport = drishya.table(
  "video_export",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    voiceoverId: uuid("voiceover_id")
      .notNull()
      .references(() => voiceover.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["preparing", "rendering", "ready", "failed"],
    }).notNull(),
    progress: integer("progress").notNull().default(0),
    timeline: jsonb("timeline").$type<Timeline>(),
    errorMessage: text("error_message"),
    profile: text("profile").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("video_export_take_created_idx").on(
      table.voiceoverId,
      table.createdAt,
    ),
  ],
);

// Resource creation and enqueue happen in the same transaction. Payloads are private.
export const generationJob = drishya.table(
  "generation_job",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    chapterId: uuid("chapter_id").references(() => chapter.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", {
      enum: ["plan", "storyboard", "voiceover", "video"],
    }).notNull(),
    resourceId: uuid("resource_id").notNull(),
    payload: jsonb("payload")
      .$type<{
        fitting?: {
          target: number;
          duration: number;
          attempts?: number;
          pendingSynthesis?: boolean;
        };
      }>()
      .notNull()
      .default({}),
    status: text("status", {
      enum: [
        "queued",
        "running",
        "retrying",
        "completed",
        "failed",
        "cancelled",
      ],
    })
      .notNull()
      .default("queued"),
    stage: text("stage").notNull().default("Waiting for worker"),
    progress: integer("progress").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lockToken: uuid("lock_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    runAfter: timestamp("run_after", { withTimezone: true })
      .defaultNow()
      .notNull(),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("generation_job_owner_created_idx").on(t.userId, t.createdAt),
    index("generation_job_queue_idx").on(t.status, t.runAfter),
    index("generation_job_resource_idx").on(t.kind, t.resourceId),
  ],
);

export const workerHeartbeat = drishya.table("worker_heartbeat", {
  id: text("id").primaryKey(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
});
