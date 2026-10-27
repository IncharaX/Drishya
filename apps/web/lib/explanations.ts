import {
  type CreationSettings,
  conversationDetailSchema,
  conversationListSchema,
  videoLibrarySchema,
} from "@drishya/contracts";
import { api } from "./api";
export async function chats(offset = 0, search = "") {
  return conversationListSchema.parse(
    (await api.get("/projects/chats", { params: { offset, q: search } })).data,
  );
}
export async function chat(id: string) {
  return conversationDetailSchema.parse(
    (await api.get(`/projects/chats/${id}`)).data,
  );
}
export async function createChat(prompt: string, requestId: string) {
  return conversationDetailSchema.parse(
    (
      await api.post(
        "/projects/chats",
        { prompt, requestId },
        { timeout: 30_000 },
      )
    ).data,
  );
}
export async function generateChat(
  id: string,
  settings: CreationSettings,
  requestId: string,
) {
  return conversationDetailSchema.parse(
    (
      await api.post(
        `/projects/chats/${id}/generate`,
        { settings, requestId },
        { timeout: 30_000 },
      )
    ).data,
  );
}
export async function sendFollowup(
  id: string,
  text: string,
  requestId: string,
  timestamp?: number,
  sourceRevisionId?: string,
) {
  return conversationDetailSchema.parse(
    (
      await api.post(
        `/projects/chats/${id}/messages`,
        { text, requestId, timestamp, sourceRevisionId },
        { timeout: 30_000 },
      )
    ).data,
  );
}
export async function chapterChoice(
  id: string,
  revisionId: string,
  choice: "chapters" | "overview",
  requestId: string,
) {
  return conversationDetailSchema.parse(
    (
      await api.post(`/projects/chats/${id}/chapters`, {
        revisionId,
        choice,
        requestId,
      })
    ).data,
  );
}
export async function answerChoice(
  id: string,
  revisionId: string,
  answer: string,
  requestId: string,
) {
  return conversationDetailSchema.parse(
    (
      await api.post(`/projects/chats/${id}/answer`, {
        revisionId,
        answer,
        requestId,
      })
    ).data,
  );
}
export async function cancelChat(id: string) {
  return conversationDetailSchema.parse(
    (await api.post(`/projects/chats/${id}/cancel`, {})).data,
  );
}
export async function retryVideo(id: string, revisionId: string) {
  return conversationDetailSchema.parse(
    (await api.post(`/projects/chats/${id}/retry`, { revisionId })).data,
  );
}
export async function selectVersion(id: string, revisionId: string) {
  return conversationDetailSchema.parse(
    (await api.post(`/projects/chats/${id}/versions`, { revisionId })).data,
  );
}
export async function videoLibrary(offset = 0) {
  return videoLibrarySchema.parse(
    (await api.get("/projects/chats/library", { params: { offset } })).data,
  );
}
export const explanationFile = (
  chatId: string,
  revisionId: string,
  file: "video.mp4" | "poster.jpg" | "captions.vtt" | "captions.srt",
  download = false,
) =>
  `/api/projects/chats/${chatId}/revisions/${revisionId}/${file}${download ? "?download=1" : ""}`;
export const explanationAudio = (
  chatId: string,
  revisionId: string,
  beatId: string,
) =>
  `/api/projects/chats/${chatId}/revisions/${revisionId}/audio/${encodeURIComponent(beatId)}`;

export async function savePreferenceDraft(
  id: string,
  settings: CreationSettings,
) {
  await api.patch(`/projects/chats/${id}/preferences`, { settings });
}
