import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pool } from "../src/database";
// Reload this checkout's worker only after its current job commits. Never abort an active render.
const processes = execFileSync("/bin/ps", ["-axo", "pid=,command="], {
  encoding: "utf8",
})
  .split("\n")
  .filter((line) => line.includes("src/jobs/worker.ts"));
const candidates = processes
  .map((line) => Number(line.trim().split(/\s+/u)[0]))
  .filter((pid) => {
    try {
      return execFileSync(
        "/usr/sbin/lsof",
        ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
        { encoding: "utf8" },
      )
        .split("\n")
        .includes(`n${process.cwd()}`);
    } catch {
      return false;
    }
  });
assert.equal(
  candidates.length,
  1,
  "Expected one worker belonging to this checkout",
);
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(72415,5)");
  console.info("Holding new claims while the active generation finishes.");
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    const result = await client.query(
      "select count(*)::int as count from drishya.generation_job where status='running'",
    );
    if (result.rows[0].count === 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      process.kill(candidates[0], "SIGKILL");
      await client.query("commit");
      console.info(
        "Idle worker reloaded through its supervisor. No active job was interrupted.",
      );
      process.exitCode = 0;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (process.exitCode !== 0)
    throw new Error("No idle boundary reached; worker left unchanged");
} finally {
  await client.query("rollback").catch(() => {});
  client.release();
  await pool.end();
}
