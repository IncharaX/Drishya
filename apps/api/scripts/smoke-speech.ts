import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "../src/env";
import { getVoices, synthesize } from "../src/speech/client";

const setup = path.join(os.homedir(), "AI/indic-tts");
const python = path.join(setup, ".venv/bin/python");
const originals = [
  "test.py",
  ".venv/pyvenv.cfg",
  "english.wav",
  "hindi.wav",
  "kannada.wav",
  "telugu.wav",
];
function audit() {
  return originals.map((name) => ({
    name,
    sha256: createHash("sha256")
      .update(readFileSync(path.join(setup, name)))
      .digest("hex"),
  }));
}
const beforeFiles = audit();
const examples = spawnSync(
  python,
  [
    "-B",
    "-c",
    "import ast,json,sys; tree=ast.parse(open(sys.argv[1]).read()); value=next(node.value for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='tests' for t in node.targets)); print(json.dumps(ast.literal_eval(value),ensure_ascii=False))",
    path.join(setup, "test.py"),
  ],
  { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
);
assert.equal(
  examples.status,
  0,
  "Could not read known-working examples without executing test.py",
);
const known = JSON.parse(examples.stdout) as Record<string, { text: string }>;
const names = { en: "english", hi: "hindi", kn: "kannada", te: "telugu" };
const output = path.resolve(
  env.MEDIA_ROOT,
  "audio",
  "verification",
  `indic-parler-${randomUUID()}`,
);
mkdirSync(output, { recursive: true });
async function health() {
  const response = await fetch(`${env.INFERENCE_URL}/health`, {
    headers: { authorization: `Bearer ${env.INFERENCE_SECRET}` },
  });
  assert.equal(response.status, 200);
  return (await response.json()) as {
    pid: number;
    python: string;
    device: string | null;
    modelLoadCount: number;
    modelLoaded: boolean;
  };
}
const initial = await health();
assert.equal(initial.python, python);
const voices = (await getVoices()).voices;
assert.deepEqual(
  voices.map((voice) => voice.language).sort(),
  ["en", "hi", "kn", "te"].sort(),
);
const results: {
  language: string;
  path: string;
  durationSeconds: number;
  sampleRate: number;
  cached: boolean;
}[] = [];
for (const [language, name] of Object.entries(names)) {
  const voice = voices.find((item) => item.language === language);
  assert.ok(
    voice?.ready,
    `${language} voice must be available from the existing local cache`,
  );
  const target = path.join(output, `${language}.wav`);
  console.info(`Generating ${language} through Drishya's speech adapter...`);
  const result = await synthesize(
    known[name].text,
    language,
    voice.id,
    1,
    AbortSignal.timeout(600_000),
    target,
  );
  results.push({
    language,
    path: target,
    durationSeconds: result.durationSeconds,
    sampleRate: result.sampleRate,
    cached: result.cached,
  });
  console.info(
    `${language}: ${result.durationSeconds.toFixed(2)}s, ${result.sampleRate}Hz, ${result.cached ? "cache reused" : "generated"}`,
  );
}
const inspect = spawnSync(
  python,
  [
    "-B",
    "-c",
    "import array,json,pathlib,sys,wave; rows=[]\nfor name in sys.argv[1:]:\n p=pathlib.Path(name)\n with wave.open(str(p),'rb') as f:\n  assert f.getnchannels()==1 and f.getsampwidth()==2 and f.getnframes()>0\n  samples=array.array('h',f.readframes(f.getnframes())); assert any(samples)\n  rows.append({'path':str(p),'bytes':p.stat().st_size,'sampleRate':f.getframerate(),'frames':f.getnframes()})\nprint(json.dumps(rows))",
    ...results.map((item) => item.path),
  ],
  { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
);
assert.equal(inspect.status, 0, `WAV validation failed: ${inspect.stderr}`);
const actual = JSON.parse(inspect.stdout) as {
  sampleRate: number;
  frames: number;
}[];
results.forEach((result, i) => {
  assert.equal(actual[i].sampleRate, result.sampleRate);
  assert.ok(
    Math.abs(actual[i].frames / actual[i].sampleRate - result.durationSeconds) <
      0.001,
  );
});
const final = await health();
assert.equal(
  final.pid,
  initial.pid,
  "Requests must use the same persistent process",
);
assert.equal(
  final.modelLoadCount,
  1,
  "The model must load exactly once across all four requests",
);
assert.equal(final.modelLoaded, true);
assert.equal(
  final.device,
  "mps",
  "Use the known-working MPS configuration on this Mac",
);
assert.deepEqual(
  audit(),
  beforeFiles,
  "The working setup and its original WAVs must remain unchanged",
);
// Exercise error handling without further generation or network/model downloads.
for (const request of [
  { text: "Unsupported", language: "xx" },
  {
    text: "Invalid path",
    language: "en",
    output_path: path.join(setup, "do-not-write.wav"),
  },
]) {
  const response = await fetch(`${env.INFERENCE_URL}/synthesize`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.INFERENCE_SECRET}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });
  assert.equal(response.status, 400);
}
writeFileSync(
  path.join(output, "report.json"),
  JSON.stringify(
    {
      interpreter: final.python,
      pid: final.pid,
      device: final.device,
      modelLoads: final.modelLoadCount,
      workingSetupUnchanged: true,
      results,
      files: JSON.parse(inspect.stdout),
    },
    null,
    2,
  ),
);
console.info(
  `Speech integration passed: four valid non-silent WAVs, one MPS model load, existing setup unchanged.\nReport: ${path.join(output, "report.json")}`,
);
