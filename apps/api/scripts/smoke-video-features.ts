import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  user,
  explanationRevision,
  videoLearning,
  sourceUpload,
  quizAttempt,
  generationJob,
} from "@drishya/db/schema";
import {
  creationSettingsSchema,
  learningContentSchema,
} from "@drishya/contracts";
import { examplePlan } from "@drishya/motion/examples";
import { app } from "../src/app";
import { auth } from "../src/auth";
import { db, pool } from "../src/database";
import { createConversation, inferSettings } from "../src/explanations/service";
import { revisionDirectory } from "../src/explanations/render";
const origin = "http://localhost:3000",
  run = randomUUID(),
  ids: string[] = [];
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Server address");
const base = `http://127.0.0.1:${address.port}/api`;
async function signup() {
  const response = await auth.api.signUpEmail({
    body: {
      name: "Feature verification",
      email: `features-${randomUUID()}@example.invalid`,
      password: `Test-${run}!`,
    },
    asResponse: true,
  });
  assert.equal(response.status, 200);
  const signed = await response.json();
  ids.push(signed.user.id);
  return {
    id: signed.user.id,
    cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}
async function request(
  url: string,
  method = "GET",
  body?: unknown,
  cookie = "",
) {
  return fetch(base + url, {
    method,
    headers: {
      origin,
      cookie,
      ...(body instanceof FormData
        ? {}
        : { "content-type": "application/json" }),
    },
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
}
try {
  const owner = await signup(),
    other = await signup();
  const inferred = inferSettings(
    "Generate a 40-second explanation in Hindi for kids, with a female voice, 3D and no music.",
  );
  assert.equal(inferred.voice, "female");
  assert.equal(inferred.language, "hi");
  assert.equal(inferred.duration, 40);
  assert.equal(inferred.style, "spatial");
  assert.equal(inferred.audience, "beginner");
  const form = new FormData();
  form.append(
    "file",
    new Blob(
      [
        "A leaf uses sunlight, water and carbon dioxide to make sugar. Oxygen is released into the air.",
      ],
      { type: "text/plain" },
    ),
    "lesson.txt",
  );
  const upload = await request("/projects/uploads", "POST", form, owner.cookie);
  assert.equal(upload.status, 201, await upload.clone().text());
  const file = await upload.json();
  for (const extension of ["pdf", "docx"]) {
    const fixture = new FormData();
    fixture.append(
      "file",
      new Blob([
        await readFile(
          new URL(`./fixtures/lesson.${extension}`, import.meta.url),
        ),
      ]),
      `lesson.${extension}`,
    );
    const response = await request(
      "/projects/uploads",
      "POST",
      fixture,
      owner.cookie,
    );
    assert.equal(response.status, 201, await response.clone().text());
  }
  const stolen = await request(
    "/projects/chats",
    "POST",
    {
      prompt: "Explain this file",
      requestId: randomUUID(),
      attachmentIds: [file.id],
    },
    other.cookie,
  );
  assert.equal(stolen.status, 400);
  const created = await request(
    "/projects/chats",
    "POST",
    {
      prompt: "Explain this file in Hindi with a female voice for 40 seconds",
      requestId: randomUUID(),
      attachmentIds: [file.id],
    },
    owner.cookie,
  );
  assert.equal(created.status, 201, await created.clone().text());
  const chat = await created.json();
  const [attached] = await db
    .select()
    .from(sourceUpload)
    .where(eq(sourceUpload.id, file.id));
  assert.equal(attached.conversationId, chat.conversation.id);
  assert.ok(chat.messages[0].content.attachments.length);
  const plan = examplePlan("process"),
    settings = creationSettingsSchema.parse({ duration: 30 });
  const [revision] = await db
    .insert(explanationRevision)
    .values({
      conversationId: chat.conversation.id,
      version: 1,
      title: "Feature fixture",
      request: "Fixture",
      settings,
      status: "ready",
      plan,
      duration: 30000,
    })
    .returning();
  await mkdir(revisionDirectory(revision.id), { recursive: true });
  await copyFile(
    path.resolve("../../data/v2/render-benchmark/managed-2.mp4"),
    path.join(revisionDirectory(revision.id), "video.mp4"),
  );
  const content = learningContentSchema.parse({
    qna: [0, 1, 2].map((i) => ({
      question: `Question number ${i + 1}?`,
      answer: "This answer is part of the controlled test fixture.",
    })),
    quiz: [0, 1, 2].map((i) => ({
      question: `Choose the correct option ${i + 1}?`,
      options: ["First", "Second", "Third", "Fourth"],
      correctIndex: i,
      explanation: "This explanation is part of the controlled test fixture.",
    })),
  });
  await db
    .insert(videoLearning)
    .values({ revisionId: revision.id, status: "ready", content });
  const feature = `/projects/video-features/${revision.id}`;
  assert.equal((await request(feature)).status, 401);
  assert.equal(
    (await request(feature, "GET", undefined, other.cookie)).status,
    404,
  );
  const feedback = await request(
    `${feature}/feedback`,
    "PUT",
    { rating: 5, message: "Clear explanation" },
    owner.cookie,
  );
  assert.equal(feedback.status, 200);
  const saved = await (
    await request(`${feature}/feedback`, "GET", undefined, owner.cookie)
  ).json();
  assert.equal(saved.rating, 5);
  const shared = await request(
    `${feature}/shares`,
    "POST",
    { showQna: false, showQuiz: true },
    owner.cookie,
  );
  assert.equal(shared.status, 201);
  const link = await shared.json(),
    token = link.path.split("/").at(-1),
    pub = `/shared/${token}`;
  const publicView = await (await request(pub)).json();
  assert.deepEqual(publicView.qna, []);
  assert.equal(publicView.quizEnabled, true);
  assert.equal(JSON.stringify(publicView).includes("correctIndex"), false);
  assert.equal((await request(`${pub}/media/${revision.id}`)).status, 200);
  const start = await request(`${pub}/attempts`, "POST", {
    name: "Test learner",
  });
  assert.equal(start.status, 201);
  const session = await start.json();
  assert.equal(JSON.stringify(session).includes("correctIndex"), false);
  const submit = await request(
    `${pub}/attempts/${session.attemptId}/submit`,
    "POST",
    { secret: session.secret, answers: [0, 1, 2] },
  );
  assert.equal(submit.status, 200);
  assert.equal((await submit.json()).score, 3);
  const replay = await (
    await request(`${pub}/attempts/${session.attemptId}/submit`, "POST", {
      secret: session.secret,
      answers: [3, 3, 3],
    })
  ).json();
  assert.equal(replay.score, 3, "Resubmission must not regrade");
  const results = await (
    await request(feature, "GET", undefined, owner.cookie)
  ).json();
  assert.equal(results.attempts[0].name, "Test learner");
  assert.equal(results.attempts[0].score, 3);
  if (process.env.FEATURE_BROWSER === "1") {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
    });
    try {
      const participant = await browser.newPage();
      await participant.goto(`${origin}${link.path}`);
      await participant.getByLabel("Your name").fill("Browser Learner");
      await participant
        .getByRole("button", { name: "Start quiz", exact: true })
        .click();
      for (let i = 0; i < 3; i++)
        await participant
          .getByRole("radiogroup")
          .nth(i)
          .getByRole("radio")
          .nth(i)
          .click();
      await participant
        .getByRole("button", { name: "Submit quiz", exact: true })
        .click();
      await participant
        .getByRole("heading", { name: "Browser Learner, you scored 3/3" })
        .waitFor()
        .catch(async (error) => {
          await mkdir(path.resolve("../../data/v2/feature-review"), {
            recursive: true,
          });
          await participant.screenshot({
            path: path.resolve("../../data/v2/feature-review/quiz-error.png"),
            fullPage: true,
          });
          console.info(await participant.locator("body").innerText());
          throw error;
        });
      await participant.reload();
      await participant
        .getByRole("heading", { name: "Browser Learner, you scored 3/3" })
        .waitFor();
      const context = await browser.newContext();
      await context.addCookies(
        owner.cookie.split("; ").map((entry) => {
          const separator = entry.indexOf("=");
          return {
            name: entry.slice(0, separator),
            value: entry.slice(separator + 1),
            url: origin,
          };
        }),
      );
      const page = await context.newPage();
      await page.goto(`${origin}/workspace/library/${chat.conversation.id}`);
      await page.getByRole("tab", { name: "Quiz results" }).click();
      await page
        .getByRole("cell", { name: "Browser Learner", exact: true })
        .waitFor();
      await page.goto(`${origin}/workspace/chat/${chat.conversation.id}`);
      await page
        .getByRole("combobox", { name: "Language", exact: true })
        .waitFor();
      assert.match(
        await page
          .getByRole("combobox", { name: "Language", exact: true })
          .innerText(),
        /Hindi/,
      );
      assert.match(
        await page
          .getByRole("combobox", { name: "Narrator", exact: true })
          .innerText(),
        /Female/,
      );
      console.info(
        "Browser passed: public named quiz, submission, reload persistence, owner results, prefilled Hindi/female preferences.",
      );
    } finally {
      await browser.close();
    }
  }
  await request(
    `${feature}/shares/${link.id}`,
    "DELETE",
    undefined,
    owner.cookie,
  );
  assert.equal((await request(pub)).status, 404);
  assert.equal((await request(`${pub}/media/${revision.id}`)).status, 404);
  const hidden = await (
    await request(
      `${feature}/shares`,
      "POST",
      { showQna: false, showQuiz: false },
      owner.cookie,
    )
  ).json();
  const hiddenPath = `/shared/${hidden.path.split("/").at(-1)}`;
  const hiddenView = await (await request(hiddenPath)).json();
  assert.deepEqual(hiddenView.qna, []);
  assert.equal(hiddenView.quizEnabled, false);
  assert.equal(
    (
      await request(`${hiddenPath}/attempts`, "POST", {
        name: "Blocked learner",
      })
    ).status,
    404,
  );
  console.info(
    "Passed: upload/binding, inferred preferences, ownership, hidden answers, named quiz, server grading, immutable resubmission, results, feedback persistence, hide-both and revocation.",
  );
} finally {
  for (const id of ids) await db.delete(user).where(eq(user.id, id));
  server.close();
  await pool.end();
}
