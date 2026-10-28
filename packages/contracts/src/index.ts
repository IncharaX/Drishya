import { z } from "zod";

export * from "./planning";
export * from "./speech";
export * from "./storyboard";

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("drishya-api"),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthSchema>;

export * from "./video";
export * from "./jobs";
export * from "./library";
export * from "./explanation";
export * from "./learning";
