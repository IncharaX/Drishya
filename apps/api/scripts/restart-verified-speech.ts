import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { request } from "node:http";
import { pool } from "../src/database";
import { env } from "../src/env";
// Fence new claims while switching both ends of the verified-speech contract.
const client = await pool.connect();
const isolatedCheck = process.env.CHECK_LANGUAGES === "1";
function ownProcesses(marker: string) {
  return execFileSync("/bin/ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line.includes(marker))
    .map((line) => Number(line.trim().split(/\s+/u)[0]))
    .filter((pid) => {
      if (pid === process.pid) return false;
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
}
let child: ReturnType<typeof spawn> | undefined;
const healthy = () =>
  new Promise<boolean>((resolve) => {
    const req = request(
      `${env.INFERENCE_URL}/health`,
      { headers: { authorization: `Bearer ${env.INFERENCE_SECRET}` } },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(72415,5)");
  if (isolatedCheck) {
    for (const pid of ownProcesses("scripts/check-verified-languages.ts"))
      process.kill(pid, "SIGTERM");
    for (const pid of ownProcesses("src/jobs/worker.ts"))
      process.kill(pid, "SIGTERM");
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await client.query(
        "select count(*)::int as count from drishya.generation_job where status='running'",
      );
      if (result.rows[0].count === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.info(
      "Saved video jobs are waiting while isolated speech tests run; no jobs were deleted.",
    );
  }
  const { rows } = await client.query(
    "select count(*)::int as count from drishya.generation_job where status='running'",
  );
  assert.equal(
    rows[0].count,
    0,
    "A generation is active. Services left unchanged; wait until it finishes.",
  );
  const root = path.resolve("../..");
  let pids: string[] = [];
  try {
    pids = execFileSync(
      "/usr/sbin/lsof",
      ["-t", "-iTCP:8001", "-sTCP:LISTEN"],
      { encoding: "utf8" },
    )
      .trim()
      .split(/\s+/u)
      .filter(Boolean);
  } catch {}
  for (const pid of new Set(pids)) {
    const command = execFileSync("/bin/ps", ["-p", pid, "-o", "command="], {
      encoding: "utf8",
    });
    assert.ok(
      command.includes(path.join(root, "services/inference/app/main.py")),
      "Port 8001 belongs to another process; left unchanged.",
    );
    process.kill(Number(pid), "SIGTERM");
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!(await healthy())) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child = spawn(
    process.execPath,
    [path.join(root, "services/inference/scripts/start.mjs")],
    { cwd: root, stdio: "inherit" },
  );
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await healthy()) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(
    ready,
    "Speech service did not become available; inspect its logs.",
  );
  // Cancel old blocking claim statements before restarting their client.
  // Otherwise a pooler can retain an orphaned transaction that later takes
  // the lock and stalls the entire queue. New workers use a nonblocking lock.
  await client.query(
    "select pg_cancel_backend(a.pid) from pg_locks l join pg_stat_activity a on a.pid=l.pid where l.locktype='advisory' and l.classid=72415 and l.objid=5 and not l.granted and a.usename=current_user and a.query='select pg_advisory_xact_lock(72415,5)'",
  );
  const processes = execFileSync("/bin/ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line.includes("src/jobs/worker.ts"));
  for (const line of processes) {
    const pid = Number(line.trim().split(/\s+/u)[0]);
    const cwd = execFileSync(
      "/usr/sbin/lsof",
      ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
      { encoding: "utf8" },
    );
    if (cwd.split("\n").includes(`n${process.cwd()}`))
      process.kill(pid, "SIGKILL");
  }
  if (isolatedCheck) {
    const check = spawn(
      process.execPath,
      [
        "--env-file=.env",
        "--import",
        "tsx",
        "scripts/check-verified-languages.ts",
      ],
      { cwd: process.cwd(), stdio: "inherit" },
    );
    const code = await new Promise<number | null>((resolve) =>
      check.once("exit", resolve),
    );
    console.info(
      `Speech check finished with exit code ${code}; resuming saved jobs.`,
    );
  }
  await client.query("commit");
  console.info(
    "Updated speech service and worker are running. Saved jobs can resume.",
  );
} finally {
  await client.query("rollback").catch(() => {});
  client.release();
  await pool.end();
}
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => child?.kill(signal));
