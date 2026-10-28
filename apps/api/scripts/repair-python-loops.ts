import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareProgrammingScenes } from "@drishya/ai";
import { motionPlanSchema } from "@drishya/contracts";
import { explanationRevision } from "@drishya/db/schema";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/database";
import { renderExplanation, revisionDirectory } from "../src/explanations/render";
const id=process.argv[2];
if(!id) throw new Error("Supply the revision ID to repair");
try {
 const [row]=await db.select().from(explanationRevision).where(eq(explanationRevision.id,id));
 if(!row?.plan || row.status!=="ready") throw new Error("Expected a ready revision with existing narration");
 const plan=motionPlanSchema.parse(row.plan);
 prepareProgrammingScenes(plan,row.request);
 if(!plan.beats.every(beat=>beat.visual.kind==="code" && beat.audioKey)) throw new Error("Repair must preserve audio and demonstrate every beat");
 plan.theme.font="manrope";
 const backup=path.join(revisionDirectory(id),`before-execution-repair-${Date.now()}`);
 await mkdir(backup,{recursive:true});
 await writeFile(path.join(backup,"plan.json"),JSON.stringify(row.plan,null,2));
 await copyFile(path.join(revisionDirectory(id),"video.mp4"),path.join(backup,"video.mp4"));
 console.info("Original plan and video preserved",backup);
 const rendered=await renderExplanation({id,plan,signal:AbortSignal.timeout(600000),onProgress:async(stage,progress)=>console.info(progress,stage)});
 await db.update(explanationRevision).set({plan,segmentKeys:rendered.segmentKeys,updatedAt:new Date()}).where(eq(explanationRevision.id,id));
 console.info("Repaired video ready",id,rendered.duration);
} finally {await pool.end();}
