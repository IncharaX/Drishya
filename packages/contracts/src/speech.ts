import { z } from "zod";
import { languageSchema, narrationLanguageSchema } from "./planning";
import {
  codeSceneSchema,
  diagramSceneSchema,
  titleSceneSchema,
} from "./storyboard";

const localizedCommon = {
  title: z.string().trim().min(1).max(160),
  narration: z.string().trim().min(1).max(1600),
};
export const localizedSceneSchema = z.discriminatedUnion("type", [
  titleSceneSchema.extend({
    ...localizedCommon,
    subtitle: z.string().max(300),
    bullets: z.array(z.string().min(1).max(200)).max(3),
  }),
  diagramSceneSchema.extend({
    ...localizedCommon,
    caption: z.string().min(1).max(300),
    nodes: z
      .array(
        z.object({ id: z.string(), label: z.string().min(1).max(96) }).strict(),
      )
      .min(2)
      .max(5),
    edges: z
      .array(
        z
          .object({
            from: z.string(),
            to: z.string(),
            label: z.string().min(1).max(64),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  }),
  codeSceneSchema.extend({
    ...localizedCommon,
    caption: z.string().min(1).max(300),
  }),
]);
export const localizedStoryboardSchema = z
  .object({
    title: z.string().min(1).max(240),
    learningObjective: z.string().min(1).max(800),
    scenes: z.array(localizedSceneSchema).min(3).max(6),
  })
  .strict();
export const voiceSchema = z.object({
  id: z.string(),
  language: narrationLanguageSchema,
  label: z.string(),
  provider: z.string(),
  revision: z.string(),
  ready: z.boolean(),
  reason: z.string().nullable(),
});
export const voiceCatalogSchema = z.object({ voices: z.array(voiceSchema) });
export const synthesisSchema = z.object({
  assetKey: z.string().regex(/^[a-f0-9]{64}$/),
  durationSeconds: z.number().positive(),
  sampleRate: z.number().positive(),
  channels: z.literal(1),
  cached: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
});
export const sceneAudioSchema = synthesisSchema.extend({ sceneId: z.string() });
export const voiceoverRequestSchema = z
  .object({
    language: narrationLanguageSchema,
    voiceId: z.string().min(1).max(100),
    speed: z.literal(1).default(1),
  })
  .strict();
export const voiceoverSchema = z.object({
  id: z.uuid(),
  lessonVersionId: z.uuid(),
  parentId: z.uuid().nullable(),
  language: languageSchema,
  voiceId: z.string(),
  voiceLabel: z.string(),
  speed: z.number(),
  status: z.enum(["localizing", "synthesizing", "ready", "failed"]),
  origin: z.enum(["generated", "edited"]),
  content: localizedStoryboardSchema.nullable(),
  audio: z.array(sceneAudioSchema).max(6),
  completedScenes: z.number().int().nonnegative(),
  totalScenes: z.number().int().min(3).max(6),
  translationModel: z.string(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const voiceoverListSchema = z.object({
  takes: z.array(voiceoverSchema),
});
export const voiceoverRevisionSchema = z
  .object({ content: localizedStoryboardSchema })
  .strict();
export type LocalizedStoryboard = z.infer<typeof localizedStoryboardSchema>;
export type Voiceover = z.infer<typeof voiceoverSchema>;
export type Voice = z.infer<typeof voiceSchema>;
export type SceneAudio = z.infer<typeof sceneAudioSchema>;
export type VoiceoverRequest = z.infer<typeof voiceoverRequestSchema>;

// Structural fields and executable-looking code remain byte-for-byte canonical.
export function localizationIssues(
  canonical: LocalizedStoryboard,
  localized: LocalizedStoryboard,
): string[] {
  const issues: string[] = [];
  if (canonical.scenes.length !== localized.scenes.length)
    return ["Keep all original scenes in the same order."];
  canonical.scenes.forEach((source, i) => {
    const target = localized.scenes[i];
    if (!target || source.id !== target.id || source.type !== target.type) {
      issues.push("Scene IDs, order and types must remain unchanged.");
      return;
    }
    if (JSON.stringify(source.sourceIds) !== JSON.stringify(target.sourceIds))
      issues.push(`${source.id}: keep source references unchanged.`);
    if (
      source.type === "title" &&
      target.type === "title" &&
      source.bullets.length !== target.bullets.length
    )
      issues.push(`${source.id}: keep the original number of key points.`);
    if (
      source.type === "code" &&
      target.type === "code" &&
      (source.code !== target.code ||
        source.language !== target.language ||
        JSON.stringify(source.focusLines) !== JSON.stringify(target.focusLines))
    )
      issues.push(
        `${source.id}: code and highlighted line references cannot be translated or edited here.`,
      );
    if (source.type === "diagram" && target.type === "diagram") {
      if (
        source.layout !== target.layout ||
        JSON.stringify(source.nodes.map((node) => node.id)) !==
          JSON.stringify(target.nodes.map((node) => node.id)) ||
        JSON.stringify(source.edges.map(({ from, to }) => ({ from, to }))) !==
          JSON.stringify(target.edges.map(({ from, to }) => ({ from, to })))
      )
        issues.push(
          `${source.id}: keep diagram layout, node IDs and arrow endpoints unchanged.`,
        );
    }
  });
  return issues;
}
