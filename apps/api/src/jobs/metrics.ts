import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";
import { jobContext } from "./context";

// Append-only attempt telemetry survives retries; never log prompts or credentials.
export async function metric(
  event: string,
  values: Record<string, unknown> = {},
  jobId = jobContext.getStore()?.id,
) {
  if (!jobId) return;
  const directory = path.resolve(env.MEDIA_ROOT, "v2", "metrics");
  await mkdir(directory, { recursive: true });
  await appendFile(
    path.join(directory, `${jobId}.jsonl`),
    JSON.stringify({ at: Date.now(), jobId, event, ...values }) + "\n",
  );
}
