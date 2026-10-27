import { spawn } from "node:child_process";
import { accessSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
loadEnvFile(path.join(root, ".env"));
const configured = process.env.TTS_PYTHON ?? "~/AI/indic-tts/.venv/bin/python";
const python = configured.startsWith("~/")
  ? path.join(os.homedir(), configured.slice(2))
  : configured;
try {
  accessSync(python);
} catch {
  throw new Error(
    `Existing TTS interpreter not found: ${python}. Set TTS_PYTHON; do not create or reinstall an environment.`,
  );
}
const child = spawn(python, ["-B", "-u", path.join(root, "app/main.py")], {
  cwd: root,
  env: {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: "1",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HF_HUB_DISABLE_TELEMETRY: "1",
  },
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(
    `Could not start the existing TTS interpreter: ${error.message}`,
  );
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
