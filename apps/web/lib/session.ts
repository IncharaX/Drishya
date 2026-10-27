import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

const sessionSchema = z
  .object({
    user: z.object({ id: z.string(), name: z.string(), email: z.email() }),
    session: z.object({ id: z.string(), expiresAt: z.string() }),
  })
  .nullable();

export const getSession = cache(async () => {
  const requestHeaders = await headers();
  const response = await fetch(
    `${process.env.API_URL ?? "http://127.0.0.1:4000"}/api/auth/get-session`,
    {
      headers: { cookie: requestHeaders.get("cookie") ?? "" },
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new Error("Unable to check your session. Please try again.");
  return sessionSchema.parse(await response.json());
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}
