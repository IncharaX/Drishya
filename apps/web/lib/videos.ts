import {
  videoExportListSchema,
  videoExportSchema,
  voiceoverSchema,
} from "@drishya/contracts";
import { api } from "./api";

const base = (
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
) =>
  `/projects/${projectId}/chapters/${chapterId}/storyboards/${versionId}/voiceovers/${takeId}`;
export async function listVideos(
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
) {
  return videoExportListSchema.parse(
    (await api.get(`${base(projectId, chapterId, versionId, takeId)}/exports`))
      .data,
  );
}
export async function createVideo(
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
) {
  return videoExportSchema.parse(
    (
      await api.post(
        `${base(projectId, chapterId, versionId, takeId)}/exports`,
        {},
        { timeout: 30_000 },
      )
    ).data,
  );
}
export async function fitNarration(
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
) {
  return voiceoverSchema.parse(
    (
      await api.post(
        `${base(projectId, chapterId, versionId, takeId)}/fit`,
        {},
        { timeout: 60_000 },
      )
    ).data,
  );
}
export function videoFileUrl(
  projectId: string,
  chapterId: string,
  versionId: string,
  takeId: string,
  exportId: string,
  file: "video.mp4" | "captions.vtt" | "captions.srt" | "manifest.json",
  download = false,
) {
  return `/api${base(projectId, chapterId, versionId, takeId)}/exports/${exportId}/${file}${download ? "?download=1" : ""}`;
}
