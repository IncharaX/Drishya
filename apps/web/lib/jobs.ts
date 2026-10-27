import {
  generationJobSchema,
  jobListSchema,
  librarySchema,
} from "@drishya/contracts";
import { api } from "./api";
export async function listJobs(projectId?: string) {
  return jobListSchema.parse(
    (await api.get("/projects/jobs", { params: { projectId } })).data,
  );
}
export async function cancelJob(id: string) {
  return generationJobSchema.parse(
    (await api.post(`/projects/jobs/${id}/cancel`, {})).data,
  );
}
export async function retryJob(id: string) {
  return generationJobSchema.parse(
    (await api.post(`/projects/jobs/${id}/retry`, {})).data,
  );
}
export async function loadLibrary(offset: number) {
  return librarySchema.parse(
    (await api.get("/projects/library", { params: { offset } })).data,
  );
}
