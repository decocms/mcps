/** CRUD for sitemig_runs — one row per phase attempt / parity iteration. */

import { requireSupabase } from "./client.ts";
import type { ParitySummary, RunKind, RunRow, RunStatus } from "./types.ts";

export async function createRun(input: {
  siteId: string;
  kind: RunKind;
  iteration?: number;
}): Promise<RunRow> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sitemig_runs")
    .insert({
      site_id: input.siteId,
      kind: input.kind,
      iteration: input.iteration ?? 0,
      status: "running",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create run: ${error.message}`);
  return data as RunRow;
}

export async function finishRun(
  runId: string,
  patch: {
    status: RunStatus;
    parityScore?: number;
    summary?: ParitySummary;
    artifactPrefix?: string;
    logsTail?: string;
  },
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("sitemig_runs")
    .update({
      status: patch.status,
      parity_score: patch.parityScore ?? null,
      summary: patch.summary ?? null,
      artifact_prefix: patch.artifactPrefix ?? null,
      logs_tail: patch.logsTail ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) throw new Error(`Failed to finish run: ${error.message}`);
}

export async function getRun(runId: string): Promise<RunRow | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sitemig_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load run: ${error.message}`);
  return (data as RunRow | null) ?? null;
}

export async function listRunsForSite(
  siteId: string,
  limit = 50,
): Promise<RunRow[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("sitemig_runs")
    .select("*")
    .eq("site_id", siteId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list runs: ${error.message}`);
  return (data as RunRow[]) ?? [];
}

/** Stamp the decopilot thread id on a running run (prefix of logs_tail). */
export async function attachThreadToRun(
  runId: string,
  threadId: string,
): Promise<void> {
  const client = requireSupabase();
  await client
    .from("sitemig_runs")
    .update({ logs_tail: `[thread ${threadId}]` })
    .eq("id", runId)
    .is("finished_at", null);
}

/** Close run rows abandoned by dead readers (pod restarts). */
export async function closeStaleRuns(olderThanMinutes: number): Promise<void> {
  const client = requireSupabase();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  await client
    .from("sitemig_runs")
    .update({
      status: "failed",
      logs_tail: "[órfã: leitor morreu com restart do pod]",
      finished_at: new Date().toISOString(),
    })
    .eq("status", "running")
    .lt("started_at", cutoff);
}
