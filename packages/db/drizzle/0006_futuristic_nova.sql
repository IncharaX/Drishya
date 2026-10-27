CREATE TABLE "drishya"."conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"settings" jsonb NOT NULL,
	"active_revision_id" uuid,
	"next_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drishya"."conversation_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"request_id" uuid,
	"role" text NOT NULL,
	"kind" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drishya"."explanation_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"source_revision_id" uuid,
	"collection_id" uuid,
	"part_index" integer,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"intent" text DEFAULT 'create' NOT NULL,
	"request" text NOT NULL,
	"settings" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text DEFAULT 'Queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"outline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"plan" jsonb,
	"edit" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"segment_keys" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_ms" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drishya"."conversation" ADD CONSTRAINT "conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "drishya"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."conversation" ADD CONSTRAINT "conversation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "drishya"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."conversation_message" ADD CONSTRAINT "conversation_message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "drishya"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drishya"."explanation_revision" ADD CONSTRAINT "explanation_revision_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "drishya"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_owner_request_idx" ON "drishya"."conversation" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "conversation_owner_updated_idx" ON "drishya"."conversation" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_message_sequence_idx" ON "drishya"."conversation_message" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_message_request_idx" ON "drishya"."conversation_message" USING btree ("conversation_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "explanation_conversation_version_idx" ON "drishya"."explanation_revision" USING btree ("conversation_id","version");--> statement-breakpoint
CREATE INDEX "explanation_collection_idx" ON "drishya"."explanation_revision" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "explanation_conversation_created_idx" ON "drishya"."explanation_revision" USING btree ("conversation_id","created_at");