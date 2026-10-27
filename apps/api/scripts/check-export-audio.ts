import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { validateAudio } from "../src/explanations/audio";
import { revisionDirectory } from "../src/explanations/render";

const array = "77d8a9c0-0dc2-4d2e-a0d8-ff901decc88a";
for (const [id, duration] of [
  [array, 25],
  ["a8529088-b7b6-4451-a116-acb0a20ce9e6", 60],
  ["ecca3696-68eb-47b0-bd1d-f2bc7c650c32", 60],
  ["092470e7-5bae-48c8-9e28-349b24162aa0", 60],
] as const) {
  const verification = await validateAudio(
    path.join(revisionDirectory(id), "video.mp4"),
    duration,
    true,
  );
  assert.ok(verification.rmsDb > -48);
  console.info("Verified audible export", id, verification);
}
const backups = (await readdir(revisionDirectory(array)))
  .filter((name) => name.startsWith("audio-repair-"))
  .sort();
let rejected = false;
for (const backup of backups) {
  try {
    await assert.rejects(
      validateAudio(
        path.join(revisionDirectory(array), backup, "original.mp4"),
        25,
        true,
      ),
      /Audio verification failed/,
    );
    rejected = true;
    break;
  } catch {}
}
assert.ok(rejected, "The original truncated AAC export must fail verification");
console.info(
  "Regression passed: truncated original rejected, four repaired exports audible and full length.",
);
