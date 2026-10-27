import * as schema from "@drishya/db/schema";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { db } from "./database";
import { env } from "./env";

export const auth = betterAuth({
  appName: "Drishya",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    schemaName: "drishya",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    cookiePrefix: "drishya",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(env.BETTER_AUTH_URL).protocol === "https:",
    },
  },
  rateLimit: { enabled: true, window: 60, max: 100 },
  telemetry: { enabled: false },
});
