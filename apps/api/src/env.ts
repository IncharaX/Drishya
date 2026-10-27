import { z } from "zod";

export const env = z
  .object({
    APP_PROFILE: z.enum(["standard", "offline"]).default("standard"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().startsWith("postgresql://"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    OLLAMA_BASE_URL: z.url().default("http://127.0.0.1:11434"),
    OLLAMA_MODEL: z.string().trim().min(1).default("qwen3:8b"),
    OLLAMA_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(600_000)
      .default(180_000),
    INFERENCE_URL: z.url().default("http://127.0.0.1:8001"),
    INFERENCE_SECRET: z.string().min(32),
    FFMPEG_PATH: z.string().default("ffmpeg"),
    FFPROBE_PATH: z.string().default("ffprobe"),
    CHROME_PATH: z.string().optional(),
    MEDIA_ROOT: z.string().default("../../data"),
  })
  .parse(process.env);

if (
  env.APP_PROFILE === "offline" &&
  !new Set(["127.0.0.1", "localhost", "[::1]"]).has(
    new URL(env.DATABASE_URL).hostname,
  )
)
  throw new Error("Offline mode requires a local PostgreSQL database.");
