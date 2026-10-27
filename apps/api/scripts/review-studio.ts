import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { creationSettingsSchema } from "@drishya/contracts";
import { conversation, explanationRevision, user } from "@drishya/db/schema";
import { examplePlan } from "@drishya/motion/examples";
import { eq } from "drizzle-orm";
import { chromium } from "playwright-core";
import { db, pool } from "../src/database";
import { revisionDirectory } from "../src/explanations/render";
import { createConversation } from "../src/explanations/service";

const origin = "http://localhost:3000",
  email = `studio-review-${randomUUID()}@example.invalid`;
const out = path.resolve("../../data/v2/ui-review");
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await mkdir(out, { recursive: true });
  const signup = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Studio review",
      email,
      password: `Local-${randomUUID()}!`,
    }),
  });
  assert.ok(signup.ok, await signup.clone().text());
  const signed = await signup.json();
  const cookies = signup.headers.getSetCookie().map((c) => c.split(";")[0]);
  const settings = creationSettingsSchema.parse({ duration: 30 });
  async function fixture(title: string, collection = false) {
    const chat = await createConversation(signed.user.id, title, randomUUID());
    const [root] = await db
      .insert(explanationRevision)
      .values({
        conversationId: chat.conversation.id,
        version: 1,
        title,
        request: title,
        settings,
        status: "ready",
        duration: 24000,
        outline: collection
          ? [
              {
                title: "Request and review",
                objective: "Review the order",
                estimatedDuration: 30,
              },
              {
                title: "Approval and fulfilment",
                objective: "Complete the order",
                estimatedDuration: 30,
              },
            ]
          : [],
        plan: collection ? null : examplePlan("process"),
      })
      .returning();
    const playable = [];
    if (collection)
      for (let i = 0; i < 2; i++) {
        const [part] = await db
          .insert(explanationRevision)
          .values({
            conversationId: chat.conversation.id,
            collectionId: root.id,
            partIndex: i,
            version: i + 2,
            title: root.outline[i].title,
            request: title,
            settings,
            status: "ready",
            duration: 24000,
            plan: examplePlan("process"),
          })
          .returning();
        playable.push(part);
      }
    else playable.push(root);
    for (const revision of playable) {
      await mkdir(revisionDirectory(revision.id), { recursive: true });
      for (const file of [
        "video.mp4",
        "poster.jpg",
        "captions.vtt",
        "captions.srt",
      ])
        await copyFile(
          path.join(revisionDirectory("reference-process"), file),
          path.join(revisionDirectory(revision.id), file),
        );
    }
    await db
      .update(conversation)
      .set({ activeRevisionId: root.id })
      .where(eq(conversation.id, chat.conversation.id));
    return { root, playable, chatId: chat.conversation.id };
  }
  const single = await fixture("How an order moves"),
    collection = await fixture("Complete order flow", true);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies(
    cookies.map((c) => ({
      name: c.slice(0, c.indexOf("=")),
      value: c.slice(c.indexOf("=") + 1),
      domain: "localhost",
      path: "/",
    })),
  );
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/workspace`);
  await page.getByRole("heading", { name: /What would you/ }).waitFor();
  await page
    .getByRole("button", { name: "Close sidebar", exact: true })
    .click();
  await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
  await page.getByRole("link", { name: "Library", exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, "chat-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, "chat-mobile.png") });
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page
    .getByRole("link", { name: "Play How an order moves", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(out, "library.png") });
  await page
    .getByRole("link", { name: "Play How an order moves", exact: true })
    .click();
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video && video.readyState >= 1;
  });
  assert.ok(await page.locator("video").getAttribute("src"));
  await page.goto(
    `${origin}/workspace/library/${collection.chatId}?revision=${collection.root.id}`,
  );
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video && video.readyState >= 1;
  });
  await page.getByRole("button", { name: /Approval and fulfilment/ }).click();
  await page.waitForFunction(
    (id) => document.querySelector("video")?.src.includes(id),
    collection.playable[1].id,
  );
  await page.waitForFunction(
    () => (document.querySelector("video")?.readyState ?? 0) >= 2,
  );
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    video.currentTime = 1;
  });
  await page.waitForFunction(
    () => (document.querySelector("video")?.readyState ?? 0) >= 2,
  );
  await page.screenshot({ path: path.join(out, "collection.png") });
  await page.reload();
  await page
    .getByRole("heading", {
      name: "Complete order flow",
      exact: true,
      level: 1,
    })
    .waitFor();
  await page.goto(`${origin}/workspace`);
  await page
    .getByRole("textbox", { name: "Describe your video" })
    .fill("Explain a refund workflow in Kannada in 45 seconds");
  await page.getByRole("button", { name: "Create chat", exact: true }).click();
  await page
    .getByRole("button", { name: "Create video", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("combobox").count(), 4);
  assert.ok(
    await page
      .locator("select")
      .evaluateAll((elements) =>
        elements.every(
          (element) =>
            element.getAttribute("aria-hidden") === "true" &&
            element.tabIndex === -1,
        ),
      ),
  );
  await page
    .getByRole("spinbutton", { name: "Exact duration in seconds" })
    .fill("40");
  await page.getByRole("combobox", { name: "Audience", exact: true }).click();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/preferences") &&
        response.request().method() === "PATCH" &&
        response.status() === 200,
    ),
    page
      .getByRole("option", { name: "Advanced / technical", exact: true })
      .click(),
  ]);
  await page.reload();
  await page
    .getByRole("button", { name: "Create video", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("spinbutton", { name: "Exact duration in seconds" })
      .inputValue(),
    "40",
  );
  assert.ok(
    (
      await page
        .getByRole("combobox", { name: "Audience", exact: true })
        .textContent()
    )?.includes("Advanced"),
  );
  await page.screenshot({ path: path.join(out, "preferences.png") });
  await page.getByRole("combobox", { name: "Length", exact: true }).click();
  await page
    .getByRole("option", { name: "Exact duration", exact: true })
    .waitFor();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, "custom-dropdown.png") });
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.info(
    `Studio UI review passed: Medvai desktop/mobile, sidebar navigation, direct video playback, chapter switching and persisted collections. Screenshots: ${out}`,
  );
} finally {
  await browser?.close();
  await db.delete(user).where(eq(user.email, email));
  await pool.end();
}
