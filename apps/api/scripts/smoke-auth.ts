import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { account, user } from "@drishya/db/schema";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/database";

// Runs against the real local frontend proxy and Neon. Only its own unique test
// user is removed in finally; no credentials, cookies or password hashes are logged.
const origin = "http://localhost:3000";
const email = `drishya-smoke-${randomUUID()}@example.invalid`;
const password = randomBytes(24).toString("base64url");
const newPassword = randomBytes(24).toString("base64url");
let cookie = "";

async function request(
  path: string,
  body?: Record<string, unknown>,
  requestOrigin = origin,
) {
  const response = await fetch(`${origin}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      origin: requestOrigin,
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const cookies = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0]);
  if (cookies.length) cookie = cookies.join("; ");
  return response;
}

try {
  const guest = await request("/workspace");
  assert.equal(guest.status, 307, "Guest workspace must redirect");
  assert.equal(
    new URL(guest.headers.get("location") ?? "", origin).pathname,
    "/sign-in",
  );
  assert.equal((await request("/api/me")).status, 401);

  const blocked = await request(
    "/api/auth/sign-up/email",
    { name: "Rejected", email, password },
    "https://untrusted.example",
  );
  assert.equal(blocked.status, 403, "Untrusted origins must be rejected");
  assert.equal(
    (
      await request("/api/auth/sign-up/email", {
        name: "Auth smoke test",
        email,
        password: "short",
      })
    ).ok,
    false,
  );

  const signup = await request("/api/auth/sign-up/email", {
    name: "Auth smoke test",
    email,
    password,
  });
  assert.equal(signup.status, 200, "Credential signup failed");
  assert.ok(
    cookie.includes("drishya.session_token="),
    "Session cookie missing",
  );
  const setCookie = signup.headers
    .getSetCookie()
    .find((value) => value.startsWith("drishya.session_token="));
  assert.match(setCookie ?? "", /HttpOnly/i);
  assert.match(setCookie ?? "", /SameSite=Lax/i);
  const signupCookie = cookie;
  const stored = await db
    .select({ password: account.password })
    .from(account)
    .innerJoin(user, eq(account.userId, user.id))
    .where(eq(user.email, email));
  assert.ok(
    stored[0]?.password && stored[0].password !== password,
    "Password must be hashed",
  );
  assert.equal((await request("/api/me")).status, 200);
  assert.equal(
    (await request("/workspace")).status,
    200,
    "Signed-in workspace must load",
  );
  assert.equal((await request("/api/auth/sign-out", {})).status, 200);
  cookie = signupCookie;
  assert.equal(
    (await request("/api/me")).status,
    401,
    "Signout must revoke the server session",
  );
  cookie = "";
  assert.equal(
    (
      await request("/api/auth/sign-in/email", {
        email,
        password: "wrong-password",
      })
    ).status,
    401,
  );
  assert.equal(
    (await request("/api/auth/sign-in/email", { email, password })).status,
    200,
  );
  assert.equal(
    (
      await request("/api/auth/change-password", {
        currentPassword: password,
        newPassword,
        revokeOtherSessions: true,
      })
    ).status,
    200,
  );
  assert.equal((await request("/api/auth/sign-out", {})).status, 200);
  cookie = "";
  assert.equal(
    (await request("/api/auth/sign-in/email", { email, password: newPassword }))
      .status,
    200,
  );
  assert.equal((await request("/api/auth/sign-out", {})).status, 200);
  console.info(
    "Auth smoke passed: protected routes, origin checks, validation, signup, hashed password, cookie session, signin, signout, password change.",
  );
} finally {
  await db.delete(user).where(eq(user.email, email));
  await pool.end();
}
