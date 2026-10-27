import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
export const jobContext = new AsyncLocalStorage<{
  id: string;
  token: string;
  signal: AbortSignal;
  report: (stage: string, progress: number) => Promise<void>;
  saveFitting: (fitting: {
    target: number;
    duration: number;
    attempts?: number;
    pendingSynthesis?: boolean;
  }) => Promise<void>;
}>();
export async function checkpoint(stage: string, progress: number) {
  const context = jobContext.getStore();
  context?.signal.throwIfAborted();
  await context?.report(stage, progress);
}
// Fence late writes by a worker that lost its lease, was cancelled, or was replaced.
export function jobFence() {
  const context = jobContext.getStore();
  if (!context) return sql`true`;
  context.signal.throwIfAborted();
  return sql`exists(select 1 from drishya.generation_job where id=${context.id}::uuid and lock_token=${context.token}::uuid and status='running' and lease_until>now() and cancel_requested_at is null for share)`;
}

export async function saveFitting(fitting: {
  target: number;
  duration: number;
  attempts?: number;
  pendingSynthesis?: boolean;
}) {
  await jobContext.getStore()?.saveFitting(fitting);
}
