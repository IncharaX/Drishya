import { healthSchema } from "@drishya/contracts";
import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  timeout: 10_000,
  withCredentials: true,
});

export async function getHealth() {
  const { data } = await api.get("/health");
  return healthSchema.parse(data);
}
