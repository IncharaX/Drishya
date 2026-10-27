import {
  type PlanRequest,
  type OutlineUpdate,
  projectDetailSchema,
  projectListSchema,
} from "@drishya/contracts";
import axios from "axios";
import { z } from "zod";
import { api } from "./api";

export async function listProjects() {
  return projectListSchema.parse((await api.get("/projects")).data);
}
export async function getProject(id: string) {
  return projectDetailSchema.parse((await api.get(`/projects/${id}`)).data);
}
export async function createProject(input: PlanRequest) {
  return projectDetailSchema.parse((await api.post("/projects", input)).data);
}
export async function retryProject(id: string, clarification?: string) {
  return projectDetailSchema.parse(
    (
      await api.post(
        `/projects/${id}/plan`,
        clarification ? { clarification } : {},
      )
    ).data,
  );
}
export async function saveOutline(id: string, input: OutlineUpdate) {
  return projectDetailSchema.parse(
    (await api.patch(`/projects/${id}/outline`, input, { timeout: 30_000 }))
      .data,
  );
}
export function projectError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401)
      return "Your session expired. Sign in again to continue.";
    const body = z
      .object({ error: z.string().max(2000) })
      .safeParse(error.response?.data);
    return body.success
      ? body.data.error
      : "Couldn’t reach the API. Check that it is running, then try again.";
  }
  if (error instanceof z.ZodError)
    return error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "Outline"}: ${issue.message}`)
      .join(" ");
  return "Something went wrong. Your saved projects are still available; please try again.";
}
