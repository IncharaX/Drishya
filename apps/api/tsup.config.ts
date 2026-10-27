import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  splitting: false,
  noExternal: [/^@drishya\//],
  clean: true,
});
