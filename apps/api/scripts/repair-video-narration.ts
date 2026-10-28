import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {and,desc,eq,inArray} from "drizzle-orm";
import {conversation,explanationRevision,generationJob} from "@drishya/db/schema";
import {creationSettingsSchema,motionPlanSchema} from "@drishya/contracts";
import {db,pool} from "../src/database";
import {appendMessage,makeRevision} from "../src/explanations/service";
const chatId=process.argv[2];assert.ok(chatId,"Supply the authorized chat ID");
try{
 const revision=await db.transaction(async tx=>{
  const [chat]=await tx.select().from(conversation).where(eq(conversation.id,chatId)).for("update");assert.ok(chat,"Chat not found");
  const revisions=await tx.select().from(explanationRevision).where(eq(explanationRevision.conversationId,chatId)).orderBy(desc(explanationRevision.version));
  const active=await tx.select().from(generationJob).where(and(inArray(generationJob.resourceId,revisions.map(row=>row.id)),inArray(generationJob.status,["queued","running","retrying"])));
  assert.equal(active.length,0,"This chat already has an active generation; it was left unchanged");
  const base=revisions.find(row=>row.status==="ready"&&row.plan);assert.ok(base?.plan,"No completed video to repair");
  const plan=motionPlanSchema.parse(structuredClone(base.plan));
  for(const beat of plan.beats){delete beat.audioKey;delete beat.audioDuration;delete beat.captionCues;delete beat.speechVerified;delete beat.durationInFrames;beat.audioPlaybackRate=1;}
  const settings=creationSettingsSchema.parse({...base.settings,language:"en"});
  const request="Correct this video's English pronunciation and narration clarity. Regenerate all speech with pronunciation normalization, transcript verification and audio-aligned captions. Preserve the factual content and visual plan.";
  const row=await makeRevision(tx,chat,{intent:"edit",sourceRevisionId:base.id,title:base.title,request,settings,plan});
  await tx.update(conversation).set({activeRevisionId:row.id,settings,updatedAt:new Date()}).where(eq(conversation.id,chatId));
  await appendMessage(tx,chatId,"user","text",{text:request},randomUUID());
  await appendMessage(tx,chatId,"assistant","generation",{revisionId:row.id});
  return row;
 });
 console.info(JSON.stringify({revisionId:revision.id,version:revision.version,status:revision.status,sourceRevisionId:revision.sourceRevisionId}));
}finally{await pool.end();}
