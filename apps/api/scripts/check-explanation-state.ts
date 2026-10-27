import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { creationSettingsSchema } from "@drishya/contracts";
import { explanationRevision, generationJob, user } from "@drishya/db/schema";
import { asc, eq } from "drizzle-orm";
import { app } from "../src/app";
import { auth } from "../src/auth";
import { db, pool } from "../src/database";
import { env } from "../src/env";
import { executeExplanation } from "../src/explanations/pipeline";
import {
  cancelConversation,
  createConversation,
  decide,
  detail,
  followup,
  generate,
  retryRevision,
} from "../src/explanations/service";
import { reconcileCollection } from "../src/jobs/resources";

assert.equal(env.APP_PROFILE, "offline");
assert.equal(new URL(env.DATABASE_URL).port, "55432");
const email = `explanation-state-${randomUUID()}@example.invalid`;
let server: ReturnType<typeof app.listen> | undefined;
try {
  const signup = await auth.api.signUpEmail({
    body: {
      name: "Explanation verification",
      email,
      password: `Local-${randomUUID()}!`,
    },
    asResponse: true,
  });
  assert.equal(signup.status, 200);
  const { user: signedUser } = await signup.json();
  const userId: string = signedUser.id;
  const cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const requestId = randomUUID();
  const first = await createConversation(
    userId,
    "Explain our order flow completely",
    requestId,
  );
  const chatId = first.conversation.id;
  assert.equal(
    (await createConversation(userId, "duplicate", requestId)).conversation.id,
    chatId,
  );
  await assert.rejects(detail("unrelated-user", chatId));
  const actionId = randomUUID();
  const generated = await generate(
    userId,
    chatId,
    creationSettingsSchema.parse({ coverage: "complete" }),
    actionId,
  );
  assert.equal(
    (await generate(userId, chatId, generated.conversation.settings, actionId))
      .revisions.length,
    1,
  );
  const parentId = generated.conversation.activeRevisionId;
  assert.ok(parentId);
  const outline = ["Request and review", "Approve and fulfil"].map((title) => ({
    title,
    objective: `Explain ${title.toLowerCase()} in order.`,
    estimatedDuration: 70,
  }));
  // Fixture a finished planning stage; no model inference is used here.
  await db
    .update(generationJob)
    .set({ status: "completed" })
    .where(eq(generationJob.resourceId, parentId));
  await db
    .update(explanationRevision)
    .set({ status: "awaiting_approval", outline })
    .where(eq(explanationRevision.id, parentId));
  const approvalId = randomUUID();
  await decide(userId, chatId, parentId, "chapters", approvalId);
  await decide(userId, chatId, parentId, "chapters", approvalId);
  await executeExplanation(parentId, new AbortController().signal);
  await executeExplanation(parentId, new AbortController().signal);
  const parts = await db
    .select()
    .from(explanationRevision)
    .where(eq(explanationRevision.collectionId, parentId))
    .orderBy(asc(explanationRevision.partIndex));
  assert.equal(parts.length, 2, "Recovery must not duplicate chapters");
  assert.deepEqual(
    parts.map((p) => p.title),
    outline.map((p) => p.title),
  );
  await cancelConversation(userId, chatId);
  const parentStatus = async () =>
    (await detail(userId, chatId)).revisions.find((r) => r.id === parentId)
      ?.status;
  assert.equal(await parentStatus(), "cancelled");
  await retryRevision(userId, chatId, parts[0].id);
  assert.equal(await parentStatus(), "generating");
  await db
    .update(explanationRevision)
    .set({ status: "ready", duration: 20000 })
    .where(eq(explanationRevision.id, parts[0].id));
  await db
    .update(explanationRevision)
    .set({ status: "failed" })
    .where(eq(explanationRevision.id, parts[1].id));
  await db
    .update(generationJob)
    .set({ status: "completed" })
    .where(eq(generationJob.projectId, first.conversation.projectId));
  await db.transaction((tx) => reconcileCollection(tx, parentId));
  assert.equal(await parentStatus(), "partial");
  const edit = await followup(userId, chatId, {
    text: "Change the background to blue",
    requestId: randomUUID(),
    sourceRevisionId: parts[0].id,
    timestamp: 3,
  });
  const editedId = edit.conversation.activeRevisionId;
  assert.ok(editedId);
  const [edited] = await db
    .select()
    .from(explanationRevision)
    .where(eq(explanationRevision.id, editedId));
  assert.equal(edited.edit.partId, parts[0].id);
  assert.equal(edited.sourceRevisionId, parentId);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const library = await fetch(`${base}/api/projects/chats/library`, {
    headers: { cookie },
  });
  assert.equal(library.status, 200);
  const payload = await library.json();
  assert.equal(
    payload.items[0].revisionId,
    parentId,
    "Queued revision must not hide playable collection",
  );
  assert.equal(payload.items[0].kind, "collection");
  assert.equal((await fetch(`${base}/api/projects/chats/library`)).status, 401);
  await db
    .update(explanationRevision)
    .set({ status: "ready", duration: 20000 })
    .where(eq(explanationRevision.id, parts[1].id));
  await db.transaction((tx) => reconcileCollection(tx, parentId));
  assert.equal(await parentStatus(), "ready");
  assert.equal(
    (await detail(userId, chatId)).revisions.find((r) => r.id === parentId)
      ?.duration,
    40,
  );
  console.info(
    "Explanation state checks passed: ownership, idempotency, approval/recovery, cancellation/retry, partial collections, targeted chapter edits and library fallback.",
  );
} finally {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error ? reject(error) : resolve())),
    );
  await db.delete(user).where(eq(user.email, email));
  await pool.end();
}
