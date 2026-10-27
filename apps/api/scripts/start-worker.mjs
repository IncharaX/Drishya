import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const production = process.argv.includes("--production");
const child = spawn(
  process.execPath,
  [
    "--env-file=.env",
    ...(production
      ? ["dist/worker.js"]
      : ["--import", "tsx", "src/jobs/worker.ts"]),
  ],
  { cwd: root, env: process.env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
