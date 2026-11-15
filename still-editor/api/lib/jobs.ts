/**
 * Edit jobs. An edit takes longer than a tool call from the UI may wait (60 s),
 * so `start` returns at once and the UI polls `read`. State lives in storage;
 * a job still "running" that this process does not hold and that is older than
 * the longest edit was interrupted (restart, scale-down).
 */
import type { Storage } from "./storage.ts";

const INTERRUPTED_AFTER_MS = 7 * 60 * 1000;

/** Where a running edit is, so the editor can show it is moving. */
export type JobPhase = "preparing" | "generating" | "composing";

export interface Job {
  id: string;
  productId: number;
  versionId: string;
  status: "running" | "done" | "failed";
  phase?: JobPhase;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

const inProcess = new Set<string>();

export async function startJob(
  store: Storage,
  job: Omit<Job, "status" | "startedAt" | "phase">,
  work: (progress: (phase: JobPhase) => Promise<void>) => Promise<unknown>,
): Promise<Job> {
  const state: Job = {
    ...job,
    status: "running",
    phase: "preparing",
    startedAt: new Date().toISOString(),
  };
  await store.putJson(`jobs/${job.id}.json`, state);
  inProcess.add(job.id);
  const progress = (phase: JobPhase) =>
    store.putJson(`jobs/${job.id}.json`, { ...state, phase });
  void work(progress)
    .then(() => ({ status: "done" as const }))
    .catch((error: unknown) => ({
      status: "failed" as const,
      error: error instanceof Error ? error.message : String(error),
    }))
    .then((end) =>
      store.putJson(`jobs/${job.id}.json`, {
        ...state,
        ...end,
        finishedAt: new Date().toISOString(),
      }),
    )
    .catch((error) => console.error(`[still-editor] job ${job.id}`, error))
    .finally(() => inProcess.delete(job.id));
  return state;
}

export async function readJob(store: Storage, id: string): Promise<Job> {
  const job = await store.getJson<Job>(`jobs/${id}.json`);
  if (!job) throw new Error(`Job ${id} was not found`);
  const stale =
    job.status === "running" &&
    !inProcess.has(id) &&
    Date.now() - Date.parse(job.startedAt) > INTERRUPTED_AFTER_MS;
  return stale
    ? {
        ...job,
        status: "failed",
        error: "The edit was interrupted. Try again.",
      }
    : job;
}
