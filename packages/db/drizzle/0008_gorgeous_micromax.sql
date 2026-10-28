CREATE INDEX "quiz_attempt_share_started_idx" ON "drishya"."quiz_attempt" USING btree ("share_id","started_at");--> statement-breakpoint
CREATE INDEX "source_upload_conversation_idx" ON "drishya"."source_upload" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "source_upload_user_idx" ON "drishya"."source_upload" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "video_share_revision_idx" ON "drishya"."video_share" USING btree ("revision_id","created_at");