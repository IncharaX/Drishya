import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const file = path.join(root, ".env.offline"),
  cluster = path.join(root, "data/postgres"),
  socket = path.join(root, "data/postgres-socket");
const command = process.argv[2] ?? "check";
function run(program, args, env = process.env, quiet = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: root,
      env,
      stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let error = "";
    child.stderr?.on("data", (chunk) => (error += chunk));
    child.on("error", () =>
      reject(
        new Error(
          `${program} is unavailable. Install the local prerequisite before disconnecting.`,
        ),
      ),
    );
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${program} exited ${code}. ${error.slice(-500)}`)),
    );
  });
}
function config() {
  if (!existsSync(file))
    throw new Error(
      "Run pnpm offline:prepare while the local prerequisites are available.",
    );
  const values = parseEnv(readFileSync(file, "utf8"));
  if (new URL(values.DATABASE_URL).hostname !== "127.0.0.1")
    throw new Error(
      "The offline profile must use the dedicated local database.",
    );
  return { ...process.env, ...values };
}
async function check() {
  for (const program of [
    "initdb",
    "pg_ctl",
    "createdb",
    "psql",
    "ffmpeg",
    "ffprobe",
  ])
    await run(
      program,
      [program.startsWith("ff") ? "-version" : "--version"],
      process.env,
      true,
    );
  const python = path.join(os.homedir(), "AI/indic-tts/.venv/bin/python");
  if (!existsSync(python))
    throw new Error(
      "The existing Indic TTS Python environment is missing; this script never installs or changes it.",
    );
  if (
    process.platform === "darwin" &&
    !existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
  )
    throw new Error("Install Google Chrome, or configure CHROME_PATH.");
  if (!existsSync(path.join(root, "node_modules")))
    throw new Error("Install workspace dependencies before disconnecting.");
  await run(
    python,
    [
      "-B",
      "-c",
      "from huggingface_hub import try_to_load_from_cache; import importlib.util; assert all(importlib.util.find_spec(name) for name in ['torch','parler_tts','transformers','soundfile']); assert isinstance(try_to_load_from_cache('ai4bharat/indic-parler-tts','config.json'),str); print('Existing Indic Parler packages and cached model configuration found.')",
    ],
    {
      ...process.env,
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      PYTHONDONTWRITEBYTECODE: "1",
    },
  );
  const base = parseEnv(readFileSync(path.join(root, "apps/api/.env"), "utf8"));
  const url = base.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  if (!new Set(["localhost", "127.0.0.1", "[::1]"]).has(new URL(url).hostname))
    throw new Error("Offline inference requires a local Ollama endpoint.");
  const response = await fetch(`${url.replace(/\/$/u, "")}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  const models = await response.json();
  if (
    !response.ok ||
    !models.models?.some(
      (model) => model.name === (base.OLLAMA_MODEL ?? "qwen3:8b"),
    )
  )
    throw new Error(
      "Start Ollama with the configured model cached before disconnecting. No download was attempted.",
    );
  console.info(
    "Local PostgreSQL/video tools, workspace packages and the existing TTS interpreter are present. No packages or models were installed.",
  );
}
async function start(env) {
  try {
    await run("pg_ctl", ["-D", cluster, "status"], env, true);
    return;
  } catch {}
  mkdirSync(socket, { recursive: true, mode: 0o700 });
  await run(
    "pg_ctl",
    [
      "-D",
      cluster,
      "-l",
      path.join(cluster, "server.log"),
      "-o",
      `-h 127.0.0.1 -p 55432 -k ${socket}`,
      "-w",
      "start",
    ],
    env,
  );
}
try {
  if (command === "check") {
    await check();
    process.exit(0);
  }
  if (command === "prepare") {
    await check();
    if (!existsSync(file)) {
      if (existsSync(path.join(cluster, "PG_VERSION")))
        throw new Error(
          "An existing local cluster has no .env.offline. Restore that file; the cluster will not be reset.",
        );
      const base = parseEnv(
        readFileSync(path.join(root, "apps/api/.env"), "utf8"),
      );
      const password = randomBytes(24).toString("hex");
      const values = {
        ...base,
        APP_PROFILE: "offline",
        DATABASE_URL: `postgresql://drishya:${password}@127.0.0.1:55432/drishya`,
        BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
        BETTER_AUTH_URL: "http://localhost:3000",
        MEDIA_ROOT: "../../data/offline",
        DRISHYA_DATA_DIR: "../../data/offline",
        API_URL: "http://127.0.0.1:4000",
        NEXT_TELEMETRY_DISABLED: "1",
      };
      writeFileSync(
        file,
        Object.entries(values)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join("\n") + "\n",
        { mode: 0o600, flag: "wx" },
      );
      chmodSync(file, 0o600);
    }
    const env = config();
    if (!existsSync(path.join(cluster, "PG_VERSION"))) {
      mkdirSync(cluster, { recursive: true, mode: 0o700 });
      const passwordFile = path.join(root, "data/.pg-init-password");
      writeFileSync(passwordFile, new URL(env.DATABASE_URL).password + "\n", {
        mode: 0o600,
      });
      try {
        await run(
          "initdb",
          [
            "-D",
            cluster,
            "-U",
            "drishya",
            "--auth-host=scram-sha-256",
            "--auth-local=trust",
            `--pwfile=${passwordFile}`,
            "--encoding=UTF8",
            "--locale=C",
          ],
          env,
        );
      } finally {
        rmSync(passwordFile, { force: true });
      }
    }
    await start(env);
    const pgEnv = { ...env, PGPASSWORD: new URL(env.DATABASE_URL).password };
    // createdb is idempotent through an explicit existence query.
    const query = spawn(
      "psql",
      [
        "-h",
        "127.0.0.1",
        "-p",
        "55432",
        "-U",
        "drishya",
        "-d",
        "postgres",
        "-tAc",
        "SELECT 1 FROM pg_database WHERE datname='drishya'",
      ],
      { env: pgEnv, stdio: ["ignore", "pipe", "inherit"] },
    );
    let output = "";
    query.stdout.on("data", (chunk) => (output += chunk));
    await new Promise((resolve, reject) => {
      query.on("error", reject);
      query.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error("Local database probe failed")),
      );
    });
    if (output.trim() !== "1")
      await run(
        "createdb",
        ["-h", "127.0.0.1", "-p", "55432", "-U", "drishya", "drishya"],
        pgEnv,
      );
    await run("pnpm", ["db:migrate"], env);
    console.info(
      "Offline database and credentials auth profile prepared. Neon was not modified. Run pnpm dev:offline after stopping the normal development processes.",
    );
  } else if (command === "dev") {
    const env = config();
    await start(env);
    const child = spawn("pnpm", ["dev"], { cwd: root, env, stdio: "inherit" });
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => child.kill(signal));
    await new Promise((resolve) =>
      child.on("exit", (code) => {
        process.exitCode = code ?? 0;
        resolve();
      }),
    );
  } else if (command === "stop") {
    await run("pg_ctl", ["-D", cluster, "-m", "fast", "-w", "stop"], config());
  } else throw new Error("Use check, prepare, dev or stop.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
