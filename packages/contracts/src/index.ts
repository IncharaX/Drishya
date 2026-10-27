import { z } from "zod";

export * from "./planning";
export * from "./storyboard";
export * from "./speech";

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("drishya-api"),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthSchema>;
