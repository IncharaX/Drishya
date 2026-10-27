import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", worker: "src/jobs/worker.ts" },
  format: ["esm"],
  platform: "node",
  target: "node24",
  splitting: false,
  noExternal: [/^@drishya\//],
  clean: true,
});
