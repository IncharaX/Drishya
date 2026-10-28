CREATE TABLE "drishya"."quiz_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"name" text NOT NULL,
	"quiz" jsonb NOT NULL,
	"answers" jsonb,
	"score" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drishya"."source_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drishya"."video_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drishya"."video_learning" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"content" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_learning_revision_id_unique" UNIQUE("revision_id")
);
--> statement-breakpoint
CREATE TABLE "drishya"."video_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"show_qna" boolean NOT NULL,
	"show_quiz" boolean NOT NULL,
	"content" jsonb,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_share_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "drishya"."quiz_attempt" ADD CONSTRAINT "quiz_attempt_share_id_video_share_id_fk" FOREIGN KEY ("share_id") REFERENCES "drishya"."video_share"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."source_upload" ADD CONSTRAINT "source_upload_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "drishya"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."source_upload" ADD CONSTRAINT "source_upload_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "drishya"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."video_feedback" ADD CONSTRAINT "video_feedback_revision_id_explanation_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "drishya"."explanation_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."video_feedback" ADD CONSTRAINT "video_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "drishya"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."video_learning" ADD CONSTRAINT "video_learning_revision_id_explanation_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "drishya"."explanation_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."video_share" ADD CONSTRAINT "video_share_revision_id_explanation_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "drishya"."explanation_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_revision_user_idx" ON "drishya"."video_feedback" USING btree ("revision_id","user_id");