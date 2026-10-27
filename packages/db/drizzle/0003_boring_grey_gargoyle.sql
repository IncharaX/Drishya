CREATE TABLE "drishya"."voiceover" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_version_id" uuid NOT NULL,
	"parent_id" uuid,
	"language" text NOT NULL,
	"voice_id" text NOT NULL,
	"voice_label" text NOT NULL,
	"speed" text NOT NULL,
	"status" text NOT NULL,
	"origin" text NOT NULL,
	"content" jsonb,
	"audio" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_scenes" integer NOT NULL,
	"translation_model" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drishya"."voiceover" ADD CONSTRAINT "voiceover_lesson_version_id_lesson_version_id_fk" FOREIGN KEY ("lesson_version_id") REFERENCES "drishya"."lesson_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voiceover_version_created_idx" ON "drishya"."voiceover" USING btree ("lesson_version_id","created_at");