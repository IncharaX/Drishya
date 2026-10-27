import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const production = process.argv.includes("--production");
let child,
  stopping = false,
  restarts = 0,
  timer;
function launch() {
  const started = Date.now();
  child = spawn(
    process.execPath,
    [
      "--env-file=.env",
      ...(production
        ? ["dist/worker.js"]
        : ["--import", "tsx", "src/jobs/worker.ts"]),
    ],
    { cwd: root, env: process.env, stdio: "inherit" },
  );
  child.on("error", (error) =>
    console.error(`Worker could not start: ${error.message}`),
  );
  child.on("exit", () => {
    if (stopping) return;
    if (Date.now() - started > 60_000) restarts = 0;
    const delay = Math.min(15000, 1000 * 2 ** Math.min(restarts++, 4));
    console.warn(
      `Generation worker stopped unexpectedly. Restarting in ${delay / 1000}s; jobs remain saved.`,
    );
    timer = setTimeout(launch, delay);
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
    clearTimeout(timer);
    if (child) child.kill(signal);
  });
launch();
