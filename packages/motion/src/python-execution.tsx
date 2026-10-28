// biome-ignore lint/correctness/noUnusedImports: Required by the export bundler.
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { ExplanationBeat } from "@drishya/contracts";
type Step = { line: number; state: string; output: string[]; note: string; cell?: number };
export function pythonTrace(code: string): Step[] | null {
  if (code === 'for number in [1, 2, 3]:\n    print(number)') {
    const steps: Step[] = [{line:0,state:"number = —",output:[],note:"Take each item in order"}];
    for(let i=0;i<3;i++) {
      steps.push({line:0,state:`number = ${i+1}`,output:Array.from({length:i},(_,n)=>String(n+1)),note:`Select item ${i+1}`,cell:i});
      steps.push({line:1,state:`number = ${i+1}`,output:Array.from({length:i+1},(_,n)=>String(n+1)),note:"Run the indented body",cell:i});
    }
    steps.push({line:-1,state:"number = 3",output:["1","2","3"],note:"No items left. The loop ends."}); return steps;
  }
  if(code === 'for step in range(3):\n    print("Mix ingredients")' || code === 'for step in range(3):\n    print("Hello")') {
    const message=code.includes("Mix ingredients")?"Mix ingredients":"Hello";
    return Array.from({length:7},(_,i)=>({line:i===6?-1:i%2,state:`step = ${Math.min(2,Math.floor(i/2))}`,output:Array.from({length:Math.min(3,Math.floor((i+1)/2))},()=>message),note:i===6?"One instruction, repeated three times":i%2?"Repeat the same action":"Move to the next iteration",cell:Math.min(2,Math.floor(i/2))}));
  }
  if(code === 'count = 0\nwhile count < 3:\n    print(count)\n    count += 1') {
    const steps:Step[]=[{line:0,state:"count = 0",output:[],note:"Start with zero"}];
    for(let i=0;i<3;i++) {
      const output=Array.from({length:i},(_,n)=>String(n));
      steps.push({line:1,state:`${i} < 3 → True`,output,note:"Check before every repetition"});
      steps.push({line:2,state:`count = ${i}`,output:[...output,String(i)],note:"The condition is true: run the body"});
      steps.push({line:3,state:`count = ${i+1}`,output:[...output,String(i)],note:"Update the variable"});
    }
    steps.push({line:1,state:"3 < 3 → False",output:["0","1","2"],note:"False: exit the loop"}); return steps;
  }
  if(code === 'answer = ""\nwhile answer != "yes":\n    answer = input("Ready? ")\nprint("Let’s go!")') return [
    {line:0,state:'answer = ""',output:[],note:"Start without an answer"},
    {line:1,state:'"" != "yes" → True',output:[],note:"The condition allows another attempt"},
    {line:2,state:'answer = "no"',output:["Ready? no"],note:"Example input: no"},
    {line:1,state:'"no" != "yes" → True',output:["Ready? no"],note:"Still true: ask again"},
    {line:2,state:'answer = "yes"',output:["Ready? no","Ready? yes"],note:"Example input: yes"},
    {line:1,state:'"yes" != "yes" → False',output:["Ready? no","Ready? yes"],note:"False: leave the loop"},
    {line:3,state:'answer = "yes"',output:["Ready? no","Ready? yes","Let’s go!"],note:"Continue after the loop"},
  ];
  return null;
}
export function PythonExecution({beat,accent}:{beat:ExplanationBeat;accent:string}) {
  const frame=useCurrentFrame(), steps=pythonTrace(beat.visual.code)!;
  const duration=beat.durationInFrames??300;
  const position=Math.min(steps.length-1,Math.floor(Math.max(0,frame-12)/Math.max(1,(duration-36)/steps.length)));
  const step=steps[position], lines=beat.visual.code.split("\n");
  const appear=interpolate(frame,[0,15],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"});
  return <div style={{position:"absolute",left:70,right:70,top:205,bottom:157,display:"grid",gridTemplateColumns:"1.35fr 1fr",gap:22,opacity:appear,fontFamily:"Inter, sans-serif"}}>
    <div style={{background:"#142236",borderRadius:18,padding:26,color:"#e6edf8",boxShadow:"0 18px 45px #10203020"}}>
      <div style={{fontSize:15,color:"#a7bbd4",marginBottom:30}}>Python · illustrative example</div>
      {lines.map((line,i)=><div key={i} style={{display:"flex",gap:16,padding:"14px 10px",borderRadius:6,background:i===step.line?`${accent}55`:"transparent",borderLeft:`4px solid ${i===step.line?"#86efac":"transparent"}`,fontFamily:"IBM Plex Mono, monospace",fontSize:20,whiteSpace:"pre",transition:"none"}}><span style={{color:"#6e849e",minWidth:18}}>{i+1}</span><span>{line}</span></div>)}
      {step.cell!==undefined&&<div style={{display:"flex",gap:12,marginTop:30}}>{[0,1,2].map((n)=><div key={n} style={{padding:"12px 21px",borderRadius:10,border:`2px solid ${step.cell===n?"#86efac":"#405068"}`,background:step.cell===n?"#245343":"transparent",fontSize:23,transform:`translateY(${step.cell===n?-5:0}px)`}}>{beat.visual.code.includes("number")?n+1:n}</div>)}</div>}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:15}}>
      <div style={{background:"#e5f1e9",border:"1px solid #b4d7c2",borderRadius:15,padding:22,color:"#163a2b"}}><div style={{fontSize:14,marginBottom:13}}>Current state</div><div style={{fontFamily:"IBM Plex Mono, monospace",fontWeight:600,fontSize:22}}>{step.state}</div></div>
      <div style={{background:"#fff",border:"1px solid #d9e0e8",borderRadius:15,padding:22,flex:1,color:"#192c42"}}><div style={{fontSize:14,color:"#66788d",marginBottom:15}}>Output</div>{step.output.map((text,i)=><div key={i} style={{fontFamily:"IBM Plex Mono, monospace",fontSize:21,lineHeight:1.6}}><span style={{color:accent}}>› </span>{text}</div>)}{!step.output.length&&<span style={{color:"#8291a3",fontSize:18}}>Waiting for the first action…</span>}</div>
      <div style={{fontSize:18,fontWeight:600,color:"#20394f",minHeight:46}}>{step.note}</div>
    </div>
  </div>;
}
