import { createDatabase } from "@drishya/db";
import { env } from "./env";

export const { db, pool } = createDatabase(env.DATABASE_URL);
