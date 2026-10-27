CREATE TABLE "drishya"."generation_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid,
	"kind" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'Waiting for worker' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lock_token" uuid,
	"lease_until" timestamp with time zone,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drishya"."worker_heartbeat" (
	"id" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drishya"."generation_job" ADD CONSTRAINT "generation_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "drishya"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."generation_job" ADD CONSTRAINT "generation_job_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "drishya"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."generation_job" ADD CONSTRAINT "generation_job_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "drishya"."chapter"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_job_owner_created_idx" ON "drishya"."generation_job" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_job_queue_idx" ON "drishya"."generation_job" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "generation_job_resource_idx" ON "drishya"."generation_job" USING btree ("kind","resource_id");--> statement-breakpoint
-- Adopt interrupted pre-worker generations once; completed historical outputs stay untouched.
INSERT INTO drishya.generation_job(user_id,project_id,kind,resource_id)
SELECT user_id,id,'plan',id FROM drishya.project WHERE status='planning';
--> statement-breakpoint
INSERT INTO drishya.generation_job(user_id,project_id,chapter_id,kind,resource_id)
SELECT p.user_id,p.id,c.id,'storyboard',v.id FROM drishya.lesson_version v JOIN drishya.chapter c ON c.id=v.chapter_id JOIN drishya.project p ON p.id=c.project_id WHERE v.status IN ('drafting','repairing');
--> statement-breakpoint
INSERT INTO drishya.generation_job(user_id,project_id,chapter_id,kind,resource_id)
SELECT p.user_id,p.id,c.id,'voiceover',a.id FROM drishya.voiceover a JOIN drishya.lesson_version v ON v.id=a.lesson_version_id JOIN drishya.chapter c ON c.id=v.chapter_id JOIN drishya.project p ON p.id=c.project_id WHERE a.status IN ('localizing','synthesizing');
--> statement-breakpoint
UPDATE drishya.voiceover SET status='failed',error_message='Interrupted legacy shortening had no durable attempt record. Shorten the original saved take again.' WHERE status='fitting';
--> statement-breakpoint
INSERT INTO drishya.generation_job(user_id,project_id,chapter_id,kind,resource_id)
SELECT p.user_id,p.id,c.id,'video',e.id FROM drishya.video_export e JOIN drishya.voiceover a ON a.id=e.voiceover_id JOIN drishya.lesson_version v ON v.id=a.lesson_version_id JOIN drishya.chapter c ON c.id=v.chapter_id JOIN drishya.project p ON p.id=c.project_id WHERE e.status IN ('preparing','rendering');
