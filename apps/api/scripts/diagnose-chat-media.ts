import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { conversation,explanationRevision,generationJob } from "@drishya/db/schema";
import { eq,desc } from "drizzle-orm";
import { db,pool } from "../src/database";
import { revisionDirectory } from "../src/explanations/render";
import { command } from "../src/video/render";
import { env } from "../src/env";
const id=process.argv[2] ?? "3c2c249a-9777-46b3-bb8c-c4b52f4c8a53";
try {
 const [chat]=await db.select().from(conversation).where(eq(conversation.id,id));if(!chat)throw new Error("Chat not found");
 const rows=await db.select().from(explanationRevision).where(eq(explanationRevision.conversationId,id)).orderBy(explanationRevision.version);
 const jobs=await db.select({resourceId:generationJob.resourceId,status:generationJob.status,attempts:generationJob.attempts,stage:generationJob.stage,error:generationJob.errorMessage}).from(generationJob).where(eq(generationJob.projectId,chat.projectId)).orderBy(desc(generationJob.createdAt)).limit(15);
 const results=[];
 for(const row of rows){
  const video=path.join(revisionDirectory(row.id),"video.mp4"),entry:{[key:string]:unknown}={id:row.id,title:row.title,status:row.status,version:row.version,collectionId:row.collectionId,error:row.errorMessage,stage:row.stage,duration:row.duration,settings:row.settings,beats:row.plan?.beats};
  if(row.status==="ready" && row.plan){
   try {const probe=await command(env.FFPROBE_PATH,["-v","error","-show_streams","-show_format","-of","json",video],AbortSignal.timeout(20000));entry.probe=JSON.parse(probe);const levels=await command(env.FFMPEG_PATH,["-hide_banner","-i",video,"-vn","-af","volumedetect","-f","null","-"],AbortSignal.timeout(20000));entry.levels=levels.slice(-1200);}catch(error){entry.mediaError=String(error);}
   const speech=[];
   for(const beat of row.plan.beats){if(!beat.audioKey)continue;const file=path.resolve(env.MEDIA_ROOT,"audio",`${beat.audioKey}.wav`);try{await access(file);const levels=await command(env.FFMPEG_PATH,["-hide_banner","-i",file,"-af","volumedetect","-f","null","-"],AbortSignal.timeout(20000));speech.push({id:beat.id,key:beat.audioKey,levels:levels.slice(-700)});}catch(error){speech.push({id:beat.id,error:String(error)});}}
   entry.speech=speech;
  }results.push(entry);
 }
 const directory=path.resolve(env.MEDIA_ROOT,"v2","diagnostics");await mkdir(directory,{recursive:true});await writeFile(path.join(directory,`${id}.json`),JSON.stringify({chat:{id,title:chat.title,activeRevisionId:chat.activeRevisionId},jobs,revisions:results},null,2));
 console.info(JSON.stringify({jobs,revisions:results.map(row=>({id:row.id,title:row.title,status:row.status,error:row.error,levels:row.levels,mediaError:row.mediaError,speech:row.speech}))}));
}finally{await pool.end();}
