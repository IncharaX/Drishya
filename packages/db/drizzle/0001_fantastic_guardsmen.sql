CREATE TABLE "drishya"."chapter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"prerequisites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_duration_seconds" integer NOT NULL,
	"position" integer NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drishya"."project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"request" jsonb NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"stage" text,
	"scope" jsonb,
	"model" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drishya"."chapter" ADD CONSTRAINT "chapter_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "drishya"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."project" ADD CONSTRAINT "project_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "drishya"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_project_position_idx" ON "drishya"."chapter" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_one_selection_idx" ON "drishya"."chapter" USING btree ("project_id") WHERE "drishya"."chapter"."is_selected" = true;--> statement-breakpoint
CREATE INDEX "project_user_updated_idx" ON "drishya"."project" USING btree ("user_id","updated_at");