import { z } from "zod";
import { narrationLanguageSchema } from "./planning";
export const creationSettingsSchema = z.object({
  language: narrationLanguageSchema.default("en"),
  voice: z.enum(["male", "female"]).default("male"),
  audience: z
    .enum(["general", "beginner", "familiar", "advanced"])
    .default("general"),
  coverage: z
    .enum(["overview", "how_it_works", "steps", "complete"])
    .default("overview"),
  duration: z
    .union([z.literal("auto"), z.number().int().min(10).max(960)])
    .default("auto"),
  style: z.enum(["auto", "cinematic", "graphic", "spatial"]).default("auto"),
  captions: z.boolean().default(true),
  sound: z.enum(["auto", "off"]).default("auto"),
  resolution: z.enum(["720p", "1080p"]).default("720p"),
  context: z.string().max(6000).default(""),
});
export type CreationSettings = z.infer<typeof creationSettingsSchema>;
export const visualKindSchema = z.enum([
  "solar",
  "process",
  "comparison",
  "cause",
  "concept",
  "chart",
  "code",
  "spatial",
  "array",
]);
export const visualNodeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,30}$/),
  label: z.string().min(1).max(64),
  detail: z.string().max(120).default(""),
  value: z.number().finite().optional(),
  color: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .optional(),
  icon: z
    .enum([
      "auto",
      "person",
      "document",
      "check",
      "question",
      "coins",
      "server",
      "planet",
      "atom",
      "gear",
      "package",
      "idea",
      "plant",
      "roots",
      "soil",
      "water",
      "leaf",
      "sun",
      "air",
      "food",
      "label",
    ])
    .default("auto"),
  shape: z.enum(["sphere", "cube", "cylinder"]).default("sphere"),
});
export const visualSchema = z.object({
  kind: visualKindSchema,
  dimension: z.enum(["2d", "3d"]).default("2d"),
  nodes: z.array(visualNodeSchema).min(1).max(9),
  links: z
    .array(
      z.object({ from: z.string(), to: z.string(), label: z.string().max(40) }),
    )
    .max(12)
    .default([]),
  code: z.string().max(1000).default(""),
  focus: z.string().max(80).default(""),
  actions: z
    .array(
      z.object({
        operation: z.enum([
          "type",
          "transfer",
          "transform",
          "reveal",
          "compare",
        ]),
        subjectId: z.string(),
        targetId: z.string(),
        cue: z.string().min(3).max(180),
        at: z.number().min(0).max(0.95).optional(),
        label: z.string().max(40).optional(),
      }),
    )
    .min(2)
    .max(13)
    .optional(),
  array: z
    .object({
      operation: z.enum([
        "build",
        "read",
        "update",
        "iterate",
        "types",
        "operations",
      ]),
      name: z.string().max(32),
      items: z.array(z.string().max(24)).min(1).max(6),
      index: z.number().int().min(0).max(5),
      replacement: z.string().max(24),
    })
    .optional(),
  motion: z.number().min(0.3).max(2).default(1),
  objectScale: z.number().min(0.5).max(2).default(1),
});
export const videoFontSchema = z.enum(["inter", "serif", "mono", "manrope"]);
export const explanationBeatSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,30}$/),
  title: z.string().min(1).max(100),
  narration: z.string().min(8).max(1000),
  evidence: z
    .array(
      z.object({ sourceId: z.string(), quote: z.string().min(20).max(350) }),
    )
    .max(4)
    .optional(),
  visual: visualSchema,
  theme: z
    .object({
      font: videoFontSchema.optional(),
      background: z
        .string()
        .regex(/^#[a-fA-F0-9]{6}$/)
        .optional(),
      accent: z
        .string()
        .regex(/^#[a-fA-F0-9]{6}$/)
        .optional(),
      ink: z
        .string()
        .regex(/^#[a-fA-F0-9]{6}$/)
        .optional(),
    })
    .optional(),
  audioKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  audioDuration: z.number().positive().optional(),
  speechVerified: z.literal("verified-chunks-v1").optional(),
  captionCues: z
    .array(
      z.object({
        text: z.string().min(1).max(350),
        start: z.number().min(0),
        end: z.number().positive(),
      }),
    )
    .max(100)
    .optional(),
  audioPlaybackRate: z.number().min(0.85).max(1.18).default(1),
  durationInFrames: z.number().int().positive().optional(),
});
export const soundDesignSchema = z.object({
  mood: z
    .enum(["none", "calm", "curious", "tech", "cinematic", "dramatic"])
    .default("none"),
  music: z.number().min(0).max(0.3).default(0.1),
  effects: z.number().min(0).max(0.4).default(0.18),
});
export const motionPlanSchema = z.object({
  version: z.literal("motion-v2"),
  title: z.string().min(1).max(160),
  summary: z.string().max(600),
  language: narrationLanguageSchema,
  theme: z.object({
    font: videoFontSchema.default("inter"),
    background: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    accent: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    ink: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  }),
  sound: soundDesignSchema.default({ mood: "none", music: 0.1, effects: 0.18 }),
  beats: z.array(explanationBeatSchema).min(1).max(20),
  fps: z.literal(30).default(30),
  captions: z.boolean().default(true),
});
export type MotionPlan = z.infer<typeof motionPlanSchema>;
export type ExplanationBeat = z.infer<typeof explanationBeatSchema>;
export function timedCaptionCues(beat: ExplanationBeat) {
  const rate = beat.audioPlaybackRate ?? 1;
  if (beat.speechVerified && beat.captionCues?.length)
    return beat.captionCues.map((cue) => ({
      ...cue,
      start: 0.2 + cue.start / rate,
      end: 0.2 + cue.end / rate,
    }));
  const words = beat.narration.split(/\s+/u),
    chunks: { text: string; count: number }[] = [];
  for (const word of words) {
    const last = chunks.at(-1);
    if (!last || last.text.length + word.length > 64)
      chunks.push({ text: word, count: 1 });
    else {
      last.text += ` ${word}`;
      last.count++;
    }
  }
  const duration =
    (beat.audioDuration ?? (beat.durationInFrames ?? 180) / 30) / rate;
  let cursor = 0;
  return chunks.map((chunk) => {
    const start = cursor;
    cursor += (chunk.count / words.length) * duration;
    return { text: chunk.text, start: 0.2 + start, end: 0.2 + cursor };
  });
}
export const chapterProposalSchema = z.object({
  title: z.string().max(140),
  objective: z.string().max(600),
  estimatedDuration: z.number().min(10).max(120),
});
export const revisionStatusSchema = z.enum([
  "queued",
  "planning",
  "awaiting_approval",
  "awaiting_input",
  "generating",
  "narrating",
  "rendering",
  "ready",
  "partial",
  "failed",
  "cancelled",
]);
export const explanationRevisionSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  sourceRevisionId: z.uuid().nullable(),
  collectionId: z.uuid().nullable(),
  partIndex: z.number().int().nullable(),
  version: z.number().int(),
  title: z.string(),
  status: revisionStatusSchema,
  stage: z.string(),
  progress: z.number(),
  settings: creationSettingsSchema,
  outline: z.array(chapterProposalSchema),
  plan: motionPlanSchema.nullable(),
  duration: z.number().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().optional(),
  timings: z.record(z.string(), z.number()).default({}),
  estimate: z
    .object({
      lowSeconds: z.number(),
      highSeconds: z.number(),
      basis: z.enum(["history", "initial"]),
      queueAhead: z.number().int().min(0).default(0),
    })
    .nullable()
    .default(null),
});
export type ExplanationRevision = z.infer<typeof explanationRevisionSchema>;
export const chatMessageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  sequence: z.number(),
  role: z.enum(["user", "assistant"]),
  kind: z.enum(["text", "preferences", "chapters", "question", "generation"]),
  content: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export const conversationSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  prompt: z.string(),
  settings: creationSettingsSchema,
  activeRevisionId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const conversationDetailSchema = z.object({
  conversation: conversationSchema,
  messages: z.array(chatMessageSchema),
  revisions: z.array(explanationRevisionSchema),
  workerOnline: z.boolean(),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
export const conversationListSchema = z.object({
  hasMore: z.boolean().default(false),
  conversations: z.array(conversationSchema),
});
export const createConversationSchema = z
  .object({
    prompt: z.string().trim().min(2).max(8000),
    requestId: z.uuid(),
    attachmentIds: z.array(z.uuid()).max(3).default([]),
  })
  .strict();
export const generateExplanationSchema = z
  .object({ settings: creationSettingsSchema, requestId: z.uuid() })
  .strict();
export const followupSchema = z
  .object({
    text: z.string().trim().min(2).max(4000),
    requestId: z.uuid(),
    timestamp: z.number().min(0).max(7200).optional(),
    beatId: z.string().optional(),
    sourceRevisionId: z.uuid().optional(),
  })
  .strict();
export const chapterDecisionSchema = z
  .object({
    revisionId: z.uuid(),
    choice: z.enum(["chapters", "overview"]),
    requestId: z.uuid(),
  })
  .strict();
export const questionAnswerSchema = z
  .object({
    revisionId: z.uuid(),
    answer: z.string().min(1).max(2000),
    requestId: z.uuid(),
  })
  .strict();
export const videoLibrarySchema = z.object({
  hasMore: z.boolean().default(false),
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      conversationId: z.uuid().nullable(),
      revisionId: z.uuid().nullable(),
      kind: z.enum(["video", "collection", "legacy"]),
      duration: z.number().nullable(),
      posterUrl: z.string().nullable(),
      videoUrl: z.string().nullable(),
      captionsUrl: z.string().nullable(),
      parts: z.array(explanationRevisionSchema),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type VideoLibrary = z.infer<typeof videoLibrarySchema>;
export function planFrames(plan: MotionPlan) {
  return plan.beats.reduce(
    (sum, beat) =>
      sum +
      (beat.durationInFrames ??
        Math.ceil(((beat.audioDuration ?? 6) + 0.5) * plan.fps)),
    0,
  );
}
export function beatStart(plan: MotionPlan, id: string) {
  let frame = 0;
  for (const beat of plan.beats) {
    if (beat.id === id) return frame / plan.fps;
    frame +=
      beat.durationInFrames ??
      Math.ceil(((beat.audioDuration ?? 6) + 0.5) * plan.fps);
  }
  return 0;
}
export function visualIssues(plan: MotionPlan) {
  const issues: string[] = [];
  if (new Set(plan.beats.map((b) => b.id)).size !== plan.beats.length)
    issues.push("Use distinct beat IDs.");
  for (const beat of plan.beats) {
    const limit = {
      process: 6,
      concept: 6,
      comparison: 4,
      chart: 4,
      cause: 4,
      spatial: 5,
      solar: 9,
      code: 6,
      array: 6,
    }[beat.visual.kind];
    if (beat.visual.nodes.length > limit)
      issues.push(
        `${beat.id}: ${beat.visual.kind} supports at most ${limit} objects per beat. Distribute the explanation across more beats without dropping steps.`,
      );
    if (
      beat.visual.kind === "chart" &&
      beat.visual.nodes.some((node) => node.value === undefined)
    )
      issues.push(
        `${beat.id}: chart objects need numeric values from the input; use a concept visual when no values were supplied.`,
      );
    if (
      beat.visual.kind === "code" &&
      (beat.visual.code.split("\n").length > 12 ||
        beat.visual.code.split("\n").some((line) => line.length > 75))
    )
      issues.push(
        `${beat.id}: keep code to 12 lines of at most 75 characters; use more beats for longer walkthroughs.`,
      );
    const ids = new Set(beat.visual.nodes.map((n) => n.id));
    if (beat.visual.actions) {
      let previous = -1;
      for (const action of beat.visual.actions) {
        if (!ids.has(action.subjectId) || !ids.has(action.targetId))
          issues.push(
            `${beat.id}: actions must reference existing artifact IDs.`,
          );
        if (
          ["transfer", "transform", "compare"].includes(action.operation) &&
          action.subjectId === action.targetId
        )
          issues.push(
            `${beat.id}: this action needs distinct source and target artifacts.`,
          );
        const position = beat.narration.indexOf(action.cue);
        if (action.at === undefined && (position < 0 || position < previous))
          issues.push(
            `${beat.id}: action cues must be exact narration excerpts in spoken order.`,
          );
        previous = position;
      }
    }
    if (
      beat.visual.kind === "array" &&
      (!beat.visual.array ||
        (["read", "update", "operations"].includes(
          beat.visual.array.operation,
        ) &&
          beat.visual.array.index >= beat.visual.array.items.length))
    )
      issues.push(
        `${beat.id}: array demonstrations need concrete items and an index inside the collection.`,
      );
    if (ids.size !== beat.visual.nodes.length)
      issues.push(`${beat.id}: use distinct object IDs.`);
    for (const edge of beat.visual.links)
      if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to)
        issues.push(
          `${beat.id}: link ${edge.from} → ${edge.to} must connect existing distinct nodes: ${[...ids].join(", ")}.`,
        );
  }
  return issues;
}

export type ChapterProposal = z.infer<typeof chapterProposalSchema>;

export const MAX_SINGLE_VIDEO_SECONDS = 120;
export function validChapterTotal(chapters: ChapterProposal[]) {
  return (
    chapters.length >= 2 &&
    chapters.every(
      (part) => part.estimatedDuration <= MAX_SINGLE_VIDEO_SECONDS,
    ) &&
    chapters.reduce((sum, part) => sum + part.estimatedDuration, 0) >
      MAX_SINGLE_VIDEO_SECONDS
  );
}
export function fitExactTimeline(
  input: MotionPlan,
  targetSeconds: number,
): MotionPlan {
  const plan = motionPlanSchema.parse(input),
    totalFrames = Math.round(targetSeconds * plan.fps);
  const minimums = plan.beats.map((beat) =>
    Math.ceil(
      ((beat.audioDuration ?? 0) / (beat.audioPlaybackRate ?? 1) + 0.28) *
        plan.fps,
    ),
  );
  const minimumFrames = minimums.reduce((sum, n) => sum + n, 0);
  if (minimumFrames > totalFrames)
    throw new Error(
      "Narration does not fit the selected duration at a natural pace.",
    );
  const remaining = totalFrames - minimumFrames;
  const weights = plan.beats.map((beat) =>
    Math.max(1, beat.audioDuration ?? beat.narration.length / 14),
  );
  const weightSum = weights.reduce((sum, n) => sum + n, 0);
  let allocated = 0;
  plan.beats.forEach((beat, index) => {
    const extra =
      index === plan.beats.length - 1
        ? remaining - allocated
        : Math.floor((remaining * weights[index]) / weightSum);
    allocated += extra;
    beat.durationInFrames = minimums[index] + extra;
  });
  return plan;
}
