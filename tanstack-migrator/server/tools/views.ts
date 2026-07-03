/** Row → safe UI shapes (tokens/grants never leave the server). */

import { z } from "zod";
import type { EventRow, RunRow, SiteRow } from "../db/types.ts";

export const SiteViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceRepo: z.string(),
  sourceBranch: z.string(),
  targetRepo: z.string().nullable(),
  prodUrl: z.string(),
  status: z.string(),
  phaseDetail: z.string().nullable(),
  parityScore: z.number().nullable(),
  parityTarget: z.number(),
  bestScore: z.number().nullable(),
  iterationsDone: z.number(),
  maxIterations: z.number(),
  previewUrl: z.string().nullable(),
  cfDeployUrl: z.string().nullable(),
  error: z.string().nullable(),
  needsHumanReason: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type SiteView = z.infer<typeof SiteViewSchema>;

export function toSiteView(row: SiteRow): SiteView {
  return {
    id: row.id,
    name: row.name,
    sourceRepo: row.source_repo,
    sourceBranch: row.source_branch,
    targetRepo: row.target_repo,
    prodUrl: row.prod_url,
    status: row.status,
    phaseDetail: row.phase_detail,
    parityScore: row.parity_score,
    parityTarget: row.parity_target,
    bestScore: row.best_score,
    iterationsDone: row.iterations_done,
    maxIterations: row.max_iterations,
    previewUrl: row.sandbox_preview_url,
    cfDeployUrl: row.cf_deploy_url,
    error: row.error,
    needsHumanReason: row.needs_human_reason,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  };
}

export const RunViewSchema = z.object({
  id: z.string(),
  kind: z.string(),
  iteration: z.number(),
  status: z.string(),
  parityScore: z.number().nullable(),
  summary: z.unknown().nullable(),
  hasArtifacts: z.boolean(),
  logsTail: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type RunView = z.infer<typeof RunViewSchema>;

export function toRunView(row: RunRow): RunView {
  return {
    id: row.id,
    kind: row.kind,
    iteration: row.iteration,
    status: row.status,
    parityScore: row.parity_score,
    summary: row.summary,
    hasArtifacts: !!row.artifact_prefix,
    logsTail: row.logs_tail,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export const EventViewSchema = z.object({
  id: z.number(),
  level: z.string(),
  message: z.string(),
  createdAt: z.string(),
});
export type EventView = z.infer<typeof EventViewSchema>;

export function toEventView(row: EventRow): EventView {
  return {
    id: row.id,
    level: row.level,
    message: row.message,
    createdAt: row.created_at,
  };
}
