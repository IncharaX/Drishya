import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type ConversationDetail,
  conversationDetailSchema,
  motionPlanSchema,
  type VideoLibrary,
  videoLibrarySchema,
  visualIssues,
} from "@drishya/contracts";
import { user } from "@drishya/db/schema";
import { eq } from "drizzle-orm";
import { chromium } from "playwright-core";
import { db, pool } from "../src/database";
import { revisionDirectory } from "../src/explanations/render";

const origin = "http://localhost:3000",
  run = randomUUID(),
  email = `drishya-v2-${run}@example.invalid`;
const out = path.resolve("../../data/v2/verification", run);
await mkdir(out, { recursive: true });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined,
  cookies = "",
  chatId = "";
async function request(
  endpoint: "/projects/chats/library",
): Promise<VideoLibrary>;
async function request(
  endpoint: string,
  body?: unknown,
): Promise<ConversationDetail>;
async function request(
  endpoint: string,
  body?: unknown,
): Promise<ConversationDetail | VideoLibrary> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await fetch(`${origin}/api${endpoint}`, {
        method: body ? "POST" : "GET",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: cookies,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(35_000),
      });
      const text = await response.text();
      if (response.status >= 500 && attempt < 7) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      const payload = JSON.parse(text);
      assert.ok(response.ok, `${endpoint}: ${response.status} ${text}`);
      return endpoint === "/projects/chats/library"
        ? videoLibrarySchema.parse(payload)
        : conversationDetailSchema.parse(payload);
    } catch (error) {
      if (attempt === 7 || error instanceof assert.AssertionError) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new Error("API did not recover");
}
async function waitForVideo(revisionId: string) {
  let previous = "";
  const deadline = Date.now() + 900_000;
  while (Date.now() < deadline) {
    const data = await request(`/projects/chats/${chatId}`);
    const revision = data.revisions.find(
      (row: { id: string }) => row.id === revisionId,
    );
    assert.ok(revision);
    const state = `${revision.status}: ${revision.stage} (${revision.progress}%)`;
    if (state !== previous) {
      console.info(state);
      previous = state;
    }
    assert.ok(revision);
    if (revision.status === "ready") return revision;
    if (
      ["failed", "cancelled", "awaiting_input", "awaiting_approval"].includes(
        revision.status,
      )
    )
      throw new Error(JSON.stringify(revision));
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("Video generation timed out");
}
try {
  const signup = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      name: "V2 verification",
      email,
      password: `Test-${randomUUID()}!`,
    }),
  });
  assert.ok(signup.ok, await signup.text());
  cookies = signup.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  await context.addCookies(
    cookies.split("; ").map((cookie) => {
      const index = cookie.indexOf("=");
      return {
        name: cookie.slice(0, index),
        value: cookie.slice(index + 1),
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax" as const,
      };
    }),
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/workspace`);
  await page.getByRole("heading", { name: /What would you/ }).waitFor();
  await page.screenshot({ path: path.join(out, "empty.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, "mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("textbox", { name: "Describe your video" })
    .fill(
      "Generate a 30 second video in English explaining why a refund needs review. Flow: customer sends the request, support checks the order, manager approves or requests missing information, finance sends the refund. Explain the reasons, not just the labels.",
    );
  await page.getByRole("button", { name: "Create chat", exact: true }).click();
  await page.waitForURL(/\/workspace\/chat\//);
  chatId = page.url().split("/").at(-1) ?? "";
  assert.ok(chatId);
  await page
    .getByRole("button", { name: "Create video", exact: true })
    .waitFor();
  await page.screenshot({ path: path.join(out, "preferences.png") });
  await page.getByRole("button", { name: "Create video", exact: true }).click();
  let detail = await request(`/projects/chats/${chatId}`);
  for (
    let attempt = 0;
    !detail.conversation.activeRevisionId && attempt < 30;
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    detail = await request(`/projects/chats/${chatId}`);
  }
  const revisionId = detail.conversation.activeRevisionId;
  assert.ok(revisionId);
  console.info("Original revision", revisionId);
  const original = await waitForVideo(revisionId);
  assert.equal(original.outline.length, 0);
  const originalPlan = motionPlanSchema.parse(original.plan);
  assert.deepEqual(visualIssues(originalPlan), []);
  assert.ok(originalPlan.beats.some((beat) => beat.visual.kind === "process"));
  await page.reload();
  await page
    .getByRole("link", { name: "Download video", exact: true })
    .first()
    .waitFor();
  await page.locator(".v2-preferences.is-submitted").waitFor();
  await page.screenshot({ path: path.join(out, "ready.png") });
  const videoResponse = await fetch(
    `${origin}/api/projects/chats/${chatId}/revisions/${revisionId}/video.mp4`,
    { headers: { cookie: cookies, range: "bytes=0-1023" } },
  );
  assert.equal(videoResponse.status, 206);
  assert.equal((await videoResponse.arrayBuffer()).byteLength, 1024);
  assert.equal(
    (
      await fetch(
        `${origin}/api/projects/chats/${chatId}/revisions/${revisionId}/video.mp4`,
      )
    ).status,
    401,
  );
  await page
    .getByRole("textbox", { name: "Video follow-up" })
    .fill(
      "Change the background to blue, use the serif font and add 3D components. Keep the narration exactly the same.",
    );
  await page.getByRole("button", { name: "Send change", exact: true }).click();
  let changed = await request(`/projects/chats/${chatId}`);
  for (
    let attempt = 0;
    changed.conversation.activeRevisionId === revisionId && attempt < 30;
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    changed = await request(`/projects/chats/${chatId}`);
  }
  assert.notEqual(changed.conversation.activeRevisionId, revisionId);
  assert.ok(changed.conversation.activeRevisionId);
  const edited = await waitForVideo(changed.conversation.activeRevisionId);
  assert.ok(edited.plan);
  assert.equal(edited.plan.theme.background, "#163c83");
  assert.equal(edited.plan.theme.font, "serif");
  assert.ok(edited.plan.beats.every((beat) => beat.visual.dimension === "3d"));
  assert.equal(edited.duration, 30);
  assert.equal(original.duration, 30);
  assert.deepEqual(
    edited.plan.beats.map((b) => b.audioKey),
    originalPlan.beats.map((b) => b.audioKey),
  );
  assert.deepEqual(
    edited.plan.beats.map((b: { narration: string }) => b.narration),
    originalPlan.beats.map((b) => b.narration),
  );
  const library = await request("/projects/chats/library");
  assert.ok(
    library.items.some(
      (item) => item.conversationId === chatId && item.revisionId === edited.id,
    ),
  );
  await page.goto(`${origin}/workspace/library`);
  await page.getByRole("heading", { name: "Your videos." }).waitFor();
  await page.screenshot({ path: path.join(out, "library.png") });
  assert.deepEqual(errors, []);
  await copyFile(
    path.join(revisionDirectory(revisionId), "video.mp4"),
    path.join(out, "refund-original.mp4"),
  );
  await copyFile(
    path.join(revisionDirectory(edited.id), "video.mp4"),
    path.join(out, "refund-edited.mp4"),
  );
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(
      {
        chatId,
        original: revisionId,
        edited: edited.id,
        duration: original.duration,
        timings: original.timings,
        editTimings: edited.timings,
        combinedEdit: {font:edited.plan.theme.font,dimension:edited.plan.beats[0].visual.dimension},
        audioReused: true,
        readySavedToLibrary: true,
        rangeRequests: true,
        noGuestAccess: true,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.info(`V2 end-to-end passed. Evidence: ${out}`);
} finally {
  await browser?.close();
  await db.delete(user).where(eq(user.email, email));
  await pool.end();
}
