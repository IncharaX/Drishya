import {
  type Storyboard,
  lessonDetailSchema,
  lessonListSchema,
} from "@drishya/contracts";
import { api } from "./api";

const base = (projectId: string, chapterId: string) =>
  `/projects/${projectId}/chapters/${chapterId}/storyboards`;
export async function listStoryboards(projectId: string, chapterId: string) {
  return lessonListSchema.parse(
    (await api.get(base(projectId, chapterId))).data,
  );
}
export async function getStoryboard(
  projectId: string,
  chapterId: string,
  versionId: string,
) {
  return lessonDetailSchema.parse(
    (await api.get(`${base(projectId, chapterId)}/${versionId}`)).data,
  );
}
export async function generateStoryboard(projectId: string, chapterId: string) {
  return lessonDetailSchema.parse(
    (await api.post(base(projectId, chapterId), {}, { timeout: 30_000 })).data,
  );
}
export async function saveStoryboard(
  projectId: string,
  chapterId: string,
  versionId: string,
  content: Storyboard,
) {
  return lessonDetailSchema.parse(
    (
      await api.post(
        `${base(projectId, chapterId)}/${versionId}/revisions`,
        { content },
        { timeout: 30_000 },
      )
    ).data,
  );
}
