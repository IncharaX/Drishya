import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../../apps/api/.env" });

if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL in apps/api/.env");

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
