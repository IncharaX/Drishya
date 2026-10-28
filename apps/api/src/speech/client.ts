import { randomUUID } from "node:crypto";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { synthesisSchema, voiceCatalogSchema } from "@drishya/contracts";
import { z } from "zod";
import { env } from "../env";
import { HttpError } from "../http-error";

async function inference(path: string, body?: unknown, signal?: AbortSignal) {
  try {
    const url = new URL(`${env.INFERENCE_URL.replace(/\/$/u, "")}${path}`);
    const requestSignal = AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(body ? 600_000 : 15_000),
    ]);
    // Native HTTP avoids fetch's separate five-minute response-header timeout
    // during a long verified paragraph, while still honoring cancellation.
    const response = await new Promise<Response>((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method: body ? "POST" : "GET",
          signal: requestSignal,
          headers: {
            authorization: `Bearer ${env.INFERENCE_SECRET}`,
            "content-type": "application/json",
          },
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          let bytes = 0;
          incoming.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > 2_000_000)
              request.destroy(new Error("Speech response too large"));
            else chunks.push(Buffer.from(chunk));
          });
          incoming.on("error", reject);
          incoming.on("end", () =>
            resolve(
              new Response(Buffer.concat(chunks).toString("utf8"), {
                status: incoming.statusCode ?? 500,
              }),
            ),
          );
        },
      );
      request.on("error", reject);
      request.end(body ? JSON.stringify(body) : undefined);
    });
    if (!response.ok) {
      const failure = z
        .object({
          error: z.object({ code: z.string(), message: z.string().max(1500) }),
        })
        .safeParse(await response.json().catch(() => null));
      throw new HttpError(
        [400, 422].includes(response.status) ? response.status : 503,
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
  const result = synthesisSchema.safeParse(
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
  if (!result.success)
    throw new HttpError(
      503,
      "The local speech service returned an invalid audio response.",
      "INVALID_SPEECH_RESPONSE",
    );
  const audio = result.data;
  const cues = audio.captions ?? [];
  if (
    cues.some(
      (cue, index) =>
        cue.end <= cue.start ||
        cue.end > audio.durationSeconds + 0.05 ||
        (index > 0 && cue.start < cues[index - 1].start),
    )
  )
    throw new HttpError(
      503,
      "The speech service returned invalid caption timing. Retry narration.",
      "INVALID_SPEECH_TIMING",
    );
  return audio;
}
