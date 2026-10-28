import {ensureBrowser} from "@remotion/renderer";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {env} from "../src/env";
const browser=await ensureBrowser();
if(!("path" in browser))throw new Error("Matching render browser unavailable");
const directory=path.resolve(env.MEDIA_ROOT,"v2");await mkdir(directory,{recursive:true});
await writeFile(path.join(directory,"render-browser.json"),JSON.stringify({path:browser.path,rendererVersion:"4.0.539",validatedAt:new Date().toISOString()},null,2));
console.info("Configured matching render-only browser",browser.path);
