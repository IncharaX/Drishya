import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  user,
  conversation,
  explanationRevision,
  generationJob,
  videoLearning,
} from "@drishya/db/schema";
import { creationSettingsSchema } from "@drishya/contracts";
import { app } from "../src/app";
import { auth } from "../src/auth";
import { db, pool } from "../src/database";
import { validateAudio } from "../src/explanations/audio";
import { revisionDirectory } from "../src/explanations/render";
import path from "node:path";
const run = randomUUID(),
  origin = "http://localhost:3000";
let userId = "",
  allComplete = false;
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Server address");
const base = `http://127.0.0.1:${address.port}/api`;
try {
  let signup: Response;
  if (process.env.RECOVER_USER_ID) {
    const [prior] = await db
      .select()
      .from(user)
      .where(eq(user.id, process.env.RECOVER_USER_ID));
    assert.ok(prior?.email.startsWith("live-features-"));
    const priorRun = prior.email.slice("live-features-".length).split("@")[0];
    signup = await auth.api.signInEmail({
      body: { email: prior.email, password: `Local-${priorRun}!` },
      asResponse: true,
    });
  } else
    signup = await auth.api.signUpEmail({
      body: {
        name: "Live feature check",
        email: `live-features-${run}@example.invalid`,
        password: `Local-${run}!`,
      },
      asResponse: true,
    });
  assert.equal(signup.status, 200);
  const signed = await signup.json();
  userId = signed.user.id;
  const cookie = signup.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  async function post(endpoint: string, body: unknown) {
    const response = await fetch(base + endpoint, {
      method: "POST",
      headers: {
        origin,
        cookie,
        ...(body instanceof FormData
          ? {}
          : { "content-type": "application/json" }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
    assert.ok(response.ok, `${endpoint}: ${await response.clone().text()}`);
    return response.json();
  }
  async function waitVideo(chatId: string) {
    const deadline = Date.now() + 600000;
    while (Date.now() < deadline) {
      const [row] = await db
        .select()
        .from(explanationRevision)
        .where(eq(explanationRevision.conversationId, chatId))
        .orderBy(explanationRevision.version);
      if (row?.status === "ready") {
        const [job] = await db
          .select()
          .from(generationJob)
          .where(eq(generationJob.resourceId, row.id));
        if (job?.status === "completed") return row;
      }
      if (
        row &&
        ["failed", "awaiting_input", "awaiting_approval"].includes(row.status)
      )
        throw new Error(`${row.status}: ${row.errorMessage ?? row.stage}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error("Video timeout");
  }
  let chat: { conversation: { id: string } };
  if (process.env.RECOVER_USER_ID) {
    const [prior] = await db
      .select()
      .from(conversation)
      .where(eq(conversation.userId, userId))
      .orderBy(conversation.createdAt);
    assert.ok(prior);
    chat = { conversation: { id: prior.id } };
    const [failed] = await db
      .select()
      .from(explanationRevision)
      .where(eq(explanationRevision.conversationId, prior.id));
    if (failed?.status === "failed")
      await post(`/projects/chats/${prior.id}/retry`, {
        revisionId: failed.id,
      });
  } else {
    const form = new FormData();
    form.append(
      "file",
      new Blob(
        [
          "An array stores values in order. Each value has an index, starting at zero. For the array [4, 7, 9], index 1 gives 7. Updating index 1 replaces 7 while preserving the other positions. A loop visits the values one at a time.",
        ],
        { type: "text/plain" },
      ),
      "arrays.txt",
    );
    const upload = await post("/projects/uploads", form);
    chat = await post("/projects/chats", {
      prompt:
        "Explain the uploaded file for a beginner in 20 seconds with a female English narrator.",
      requestId: randomUUID(),
      attachmentIds: [upload.id],
    });
    await post(`/projects/chats/${chat.conversation.id}/generate`, {
      requestId: randomUUID(),
      settings: creationSettingsSchema.parse({
        duration: 20,
        voice: "female",
        language: "en",
        style: "graphic",
      }),
    });
  }
  const original = await waitVideo(chat.conversation.id);
  assert.ok(original.plan);
  await validateAudio(
    path.join(revisionDirectory(original.id), "video.mp4"),
    20,
    true,
  );
  assert.equal(original.settings.voice, "female");
  console.info(
    "Live uploaded-file → female narration → 20s video passed",
    original.id,
  );
  await post(`/projects/video-features/${original.id}/learning`, {});
  const deadline = Date.now() + 360000;
  let learned = false;
  while (Date.now() < deadline) {
    const [row] = await db
      .select()
      .from(videoLearning)
      .where(eq(videoLearning.revisionId, original.id));
    if (row?.status === "ready") {
      const [job] = await db
        .select()
        .from(generationJob)
        .where(eq(generationJob.resourceId, row.id));
      if (job?.status === "completed") {
        assert.ok(row.content?.quiz.length);
        learned = true;
        console.info("Live Qwen Q&A and quiz passed", row.content?.quiz.length);
        break;
      }
    }
    if (row?.status === "failed")
      throw new Error(row.error ?? "Learning failed");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  assert.ok(learned, "Learning timeout");
  const duplicateRequest = {
    language: "hi",
    voice: "male",
    requestId: randomUUID(),
  };
  const copy = await post(
    `/projects/video-features/${original.id}/duplicate`,
    duplicateRequest,
  );
  const repeated = await post(
    `/projects/video-features/${original.id}/duplicate`,
    duplicateRequest,
  );
  assert.equal(copy.chatId, repeated.chatId);
  const duplicated = await waitVideo(copy.chatId);
  assert.equal(duplicated.settings.language, "hi");
  assert.equal(duplicated.settings.voice, "male");
  assert.equal(duplicated.sourceRevisionId, original.id);
  assert.ok(
    duplicated.plan?.beats.some((b) => /[\u0900-\u097f]/u.test(b.narration)),
  );
  await validateAudio(
    path.join(revisionDirectory(duplicated.id), "video.mp4"),
    duplicated.duration! / 1000,
    true,
  );
  console.info(
    "Live duplicate → Hindi/male narration → MP4 passed",
    duplicated.id,
  );
  allComplete = true;
} finally {
  if (userId) {
    const active = await db
      .select()
      .from(generationJob)
      .where(
        and(
          eq(generationJob.userId, userId),
          inArray(generationJob.status, ["queued", "running", "retrying"]),
        ),
      );
    if (!active.length && allComplete)
      await db.delete(user).where(eq(user.id, userId));
    else console.info("Preserving active diagnostic generation", userId);
  }
  server.close();
  await pool.end();
}
