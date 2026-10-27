CREATE TABLE "drishya"."lesson_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"parent_id" uuid,
	"origin" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"input_fingerprint" text NOT NULL,
	"content" jsonb,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drishya"."lesson_version" ADD CONSTRAINT "lesson_version_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "drishya"."chapter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_chapter_version_idx" ON "drishya"."lesson_version" USING btree ("chapter_id","version");