import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {ExplanationDirector} from '@drishya/ai';
import {creationSettingsSchema,fitExactTimeline,type MotionPlan} from '@drishya/contracts';
import {examplePlan} from '@drishya/motion/examples';
import {conversation,explanationRevision} from '@drishya/db/schema';
import {desc,eq} from 'drizzle-orm';
import {db,pool} from '../src/database';
import {env} from '../src/env';
import {getVoices,synthesize} from '../src/speech/client';
import {renderExplanation} from '../src/explanations/render';
import {appendMessage} from '../src/explanations/service';
const root=path.resolve(env.MEDIA_ROOT,'submission-regional');
const signal=AbortSignal.timeout(1800000);
const director=new ExplanationDirector({baseURL:env.OLLAMA_BASE_URL,model:env.OLLAMA_MODEL,timeoutMs:150000,onMetric:async(v)=>console.info('Qwen',JSON.stringify(v))});
type Entry={language:'kn'|'te';chatId:string;id:string;plan:MotionPlan};
const entries:Entry[]=[];let active:string|undefined;
try{
 await mkdir(root,{recursive:true});
 const [owner]=await db.select().from(conversation).orderBy(desc(conversation.createdAt)).limit(1);
 if(!owner)throw new Error('No local account');
 const catalog=await getVoices();
 for(const language of ['kn','te'] as const){
  const checkpoint=path.join(root,`${language}-checkpoint.json`);
  let entry:Entry|undefined;try{entry=JSON.parse(await readFile(checkpoint,'utf8'));}catch{}
  if(!entry){
   const chatId=randomUUID(),id=randomUUID(),plan=examplePlan('solar');
   plan.title='Our Solar System';plan.summary='The Sun, Earth and the planets.';
   plan.theme={background:'#0c172d',ink:'#f3f7ff',accent:'#f6bf63',font:'manrope'};plan.sound={mood:'none',music:0,effects:0};
   plan.beats[0].title='The Sun and its planets';plan.beats[0].narration='The Sun is a star. Eight planets travel around it. Gravity holds our solar system together.';
   plan.beats[1].title='Earth moves around the Sun';plan.beats[1].narration='Earth spins and travels around the Sun. One complete journey around the Sun takes about one year.';
   plan.beats[2].title='Different worlds';plan.beats[2].narration='The planets differ in size and distance from the Sun. These orbits are simplified and are not drawn to scale.';
   const settings=creationSettingsSchema.parse({language,voice:'male',duration:'auto',audience:'beginner',resolution:'720p',captions:true,sound:'off',style:'spatial'});
   await db.transaction(async tx=>{
    await tx.insert(conversation).values({id:chatId,userId:owner.userId,projectId:owner.projectId,requestId:randomUUID(),title:`Solar System (${language})`,prompt:`Explain our solar system in ${language}`,settings,activeRevisionId:id});
    await tx.insert(explanationRevision).values({id,conversationId:chatId,version:1,title:plan.title,request:'Explain our solar system',settings,status:'generating',stage:'Translating narration',plan});
    await appendMessage(tx,chatId,'user','text',{text:`Generate a short solar-system explanation in ${language==='kn'?'Kannada':'Telugu'}.`});
    await appendMessage(tx,chatId,'assistant','generation',{revisionId:id});
   });
   entry={language,chatId,id,plan};await writeFile(checkpoint,JSON.stringify(entry));
  }
  active=entry.id;
  if(entry.plan.language!==language){
   entry.plan=await director.translate(entry.plan,language,signal,async(done,total)=>{
    console.info(language,`Translation ${done}/${total}`);
    await db.update(explanationRevision).set({stage:`Translating text ${done} of ${total}`,status:'generating',progress:Math.floor(done/total*30),updatedAt:new Date()}).where(eq(explanationRevision.id,entry!.id));
   });await writeFile(checkpoint,JSON.stringify(entry));
  }
  await db.update(explanationRevision).set({plan:entry.plan,title:entry.plan.title}).where(eq(explanationRevision.id,entry.id));entries.push(entry);
 }
 await fetch(`${env.OLLAMA_BASE_URL}/api/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:env.OLLAMA_MODEL,keep_alive:0,stream:false}),signal});
 for(const entry of entries){
  active=entry.id;const voice=catalog.voices.find(v=>v.language===entry.language&&v.gender==='male'&&v.ready);if(!voice)throw new Error('Voice unavailable');
  for(const [index,beat] of entry.plan.beats.entries()){
   console.info(entry.language,`Speech ${index+1}/${entry.plan.beats.length}`);
   await db.update(explanationRevision).set({status:'narrating',stage:`Recording narration ${index+1} of ${entry.plan.beats.length}`,progress:35+index*8,updatedAt:new Date()}).where(eq(explanationRevision.id,entry.id));
   if(!beat.audioKey){const audio=await synthesize(beat.narration,entry.language,voice.id,1,signal);beat.audioKey=audio.assetKey;beat.audioDuration=audio.durationSeconds;beat.audioPlaybackRate=1;beat.durationInFrames=Math.ceil((audio.durationSeconds+.5)*30);console.info(entry.language,'Audio',index+1,audio.durationSeconds);await writeFile(path.join(root,`${entry.language}-checkpoint.json`),JSON.stringify(entry));await db.update(explanationRevision).set({plan:entry.plan,updatedAt:new Date()}).where(eq(explanationRevision.id,entry.id));}
  }
  const natural=entry.plan.beats.reduce((n,b)=>n+(b.audioDuration??0)+.5,0);entry.plan=fitExactTimeline(entry.plan,Math.max(30,Math.ceil(natural)));
  await db.update(explanationRevision).set({plan:entry.plan,status:'rendering'}).where(eq(explanationRevision.id,entry.id));
  const result=await renderExplanation({id:entry.id,plan:entry.plan,signal,onProgress:async(stage,progress)=>{console.info(entry.language,progress,stage);await db.update(explanationRevision).set({stage,progress,updatedAt:new Date()}).where(eq(explanationRevision.id,entry.id));}});
  await db.update(explanationRevision).set({plan:entry.plan,status:'ready',stage:'Your video is ready',progress:100,duration:Math.round(result.duration*1000),segmentKeys:result.segmentKeys,errorMessage:null,timings:{exportHeight:720},updatedAt:new Date()}).where(eq(explanationRevision.id,entry.id));
  await db.update(conversation).set({title:entry.plan.title,updatedAt:new Date()}).where(eq(conversation.id,entry.chatId));
  const output=path.join(root,`Drishya-Solar-System-${entry.language==='kn'?'Kannada':'Telugu'}.mp4`);await copyFile(path.resolve(env.MEDIA_ROOT,'v2/revisions',entry.id,'video.mp4'),output);console.info('READY',JSON.stringify({language:entry.language,chatId:entry.chatId,duration:result.duration,output}));
 }
}catch(e){if(active)await db.update(explanationRevision).set({status:'failed',stage:'Generation needs attention',errorMessage:String(e),updatedAt:new Date()}).where(eq(explanationRevision.id,active));throw e;}finally{await pool.end();}
