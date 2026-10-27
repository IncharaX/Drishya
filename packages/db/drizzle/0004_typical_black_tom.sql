CREATE TABLE "drishya"."video_export" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voiceover_id" uuid NOT NULL,
	"status" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"timeline" jsonb,
	"error_message" text,
	"profile" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drishya"."video_export" ADD CONSTRAINT "video_export_voiceover_id_voiceover_id_fk" FOREIGN KEY ("voiceover_id") REFERENCES "drishya"."voiceover"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_export_take_created_idx" ON "drishya"."video_export" USING btree ("voiceover_id","created_at");