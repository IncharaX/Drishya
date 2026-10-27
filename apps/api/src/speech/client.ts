import { randomUUID } from "node:crypto";
import path from "node:path";
import { synthesisSchema, voiceCatalogSchema } from "@drishya/contracts";
import { z } from "zod";
import { env } from "../env";
import { HttpError } from "../http-error";

async function inference(path: string, body?: unknown, signal?: AbortSignal) {
  try {
    const response = await fetch(
      `${env.INFERENCE_URL.replace(/\/$/u, "")}${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${env.INFERENCE_SECRET}`,
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.any([
          ...(signal ? [signal] : []),
          AbortSignal.timeout(body ? 600_000 : 15_000),
        ]),
      },
    );
    if (!response.ok) {
      const failure = z
        .object({
          error: z.object({ code: z.string(), message: z.string().max(1500) }),
        })
        .safeParse(await response.json().catch(() => null));
      throw new HttpError(
        response.status === 400 ? 400 : 503,
        response.status === 401
          ? "Inference credentials do not match. Use the same INFERENCE_SECRET in the API and speech service."
          : failure.success
            ? failure.data.error.message
            : "Local narration failed. Check the existing Indic Parler service.",
        failure.success ? failure.data.error.code : "SPEECH_FAILED",
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      503,
      "Cannot reach the local speech service. Start it on port 8001, then retry.",
      "INFERENCE_UNAVAILABLE",
    );
  }
}
export async function getVoices() {
  return voiceCatalogSchema.parse(await inference("/voices"));
}
export async function synthesize(
  text: string,
  language: string,
  voiceId: string,
  speed: number,
  signal: AbortSignal,
  outputPath?: string,
) {
  return synthesisSchema.parse(
    await inference(
      "/synthesize",
      {
        text,
        language,
        voiceId,
        speed,
        output_path:
          outputPath ??
          path.resolve(
            env.MEDIA_ROOT,
            "audio",
            "generated",
            `${randomUUID()}.wav`,
          ),
      },
      signal,
    ),
  );
}
