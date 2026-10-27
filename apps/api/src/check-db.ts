import { createDatabase } from "@drishya/db";
import { sql } from "drizzle-orm";
import { env } from "./env";

const { db, pool } = createDatabase(env.DATABASE_URL);
try {
  await db.execute(sql`select 1`);
  console.info("Database connection successful (read-only SELECT 1).");
} catch {
  console.error(
    "Database connection failed. Check DATABASE_URL and network access.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
