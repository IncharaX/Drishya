import {
  type LocalizedStoryboard,
  type VoiceoverRequest,
  voiceCatalogSchema,
  voiceoverListSchema,
  voiceoverSchema,
} from "@drishya/contracts";
import { api } from "./api";

const base = (projectId: string, chapterId: string, versionId: string) =>
  `/projects/${projectId}/chapters/${chapterId}/storyboards/${versionId}/voiceovers`;
export async function listVoices() {
  return voiceCatalogSchema.parse(
    (await api.get("/projects/speech/voices")).data,
  );
}
export async function listVoiceovers(
  projectId: string,
  chapterId: string,
  versionId: string,
) {
  return voiceoverListSchema.parse(
    (await api.get(base(projectId, chapterId, versionId))).data,
  );
}
export async function createVoiceover(
  projectId: string,
  chapterId: string,
  versionId: string,
  input: VoiceoverRequest,
) {
  return voiceoverSchema.parse(
    (
      await api.post(base(projectId, chapterId, versionId), input, {
        timeout: 30_000,
      })
    ).data,
  );
}
export async function reviseVoiceover(
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
  content: LocalizedStoryboard,
) {
  return voiceoverSchema.parse(
    (
      await api.post(
        `${base(projectId, chapterId, versionId)}/${takeId}/revisions`,
        { content },
        { timeout: 30_000 },
      )
    ).data,
  );
}
export function sceneAudioUrl(
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
  sceneId: string,
) {
  return `/api${base(projectId, chapterId, versionId)}/${takeId}/audio/${encodeURIComponent(sceneId)}`;
}
