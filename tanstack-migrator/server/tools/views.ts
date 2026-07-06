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
  resumeStatus: z.string().nullable(),
  phaseDetail: z.string().nullable(),
  parityScore: z.number().nullable(),
  parityTarget: z.number(),
  bestScore: z.number().nullable(),
  iterationsDone: z.number(),
  maxIterations: z.number(),
  issuesTotal: z.number(),
  issuesOpen: z.number(),
  issuesClosed: z.number(),
  fixSessionsDone: z.number(),
  maxFixSessions: z.number(),
  workBranch: z.string(),
  prNumber: z.number().nullable(),
  prUrl: z.string().nullable(),
  costTotal: z.number(),
  previewUrl: z.string().nullable(),
  previewReady: z.boolean(),
  cfDeployUrl: z.string().nullable(),
  queuePosition: z.number().nullable(),
  baselineScore: z.number().nullable(),
  baselineMeasuredAt: z.string().nullable(),
  baselineReportUrl: z.string().nullable(),
  assigneeLogin: z.string().nullable(),
  assigneeAvatarUrl: z.string().nullable(),
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
    resumeStatus: row.resume_status,
    phaseDetail: row.phase_detail,
    parityScore: row.parity_score,
    parityTarget: row.parity_target,
    bestScore: row.best_score,
    iterationsDone: row.iterations_done,
    maxIterations: row.max_iterations,
    issuesTotal: row.issues_total ?? 0,
    issuesOpen: row.issues_open ?? 0,
    issuesClosed: row.issues_closed ?? 0,
    fixSessionsDone: row.fix_sessions_done ?? 0,
    maxFixSessions: row.max_fix_sessions ?? 20,
    workBranch: row.work_branch ?? "migration/tanstack",
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    costTotal: Number(row.cost_total ?? 0),
    previewUrl: row.sandbox_preview_url,
    previewReady: row.preview_ready ?? false,
    cfDeployUrl: row.cf_deploy_url,
    queuePosition: row.queue_position ?? null,
    baselineScore: row.baseline_score ?? null,
    baselineMeasuredAt: row.baseline_measured_at ?? null,
    baselineReportUrl: row.baseline_report_prefix ?? null,
    assigneeLogin: row.assignee_login ?? null,
    assigneeAvatarUrl: row.assignee_avatar_url ?? null,
    error: row.error,
    needsHumanReason: row.needs_human_reason,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  };
}

export const RunMetaViewSchema = z
  .object({
    usage: z
      .object({
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        totalTokens: z.number().optional(),
        costUsd: z.number().optional(),
      })
      .optional(),
    commands: z
      .array(z.object({ cmd: z.string(), exit: z.number().optional() }))
      .optional(),
    issues: z
      .object({
        taken: z.array(z.number()).optional(),
        resolved: z.array(z.number()).optional(),
        blocked: z
          .array(
            z.object({ number: z.number(), reason: z.string().optional() }),
          )
          .optional(),
        created: z.number().optional(),
      })
      .optional(),
    threadId: z.string().optional(),
  })
  .nullable();

export const RunViewSchema = z.object({
  id: z.string(),
  kind: z.string(),
  iteration: z.number(),
  status: z.string(),
  parityScore: z.number().nullable(),
  summary: z.unknown().nullable(),
  hasArtifacts: z.boolean(),
  threadId: z.string().nullable(),
  logsTail: z.string().nullable(),
  meta: RunMetaViewSchema,
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
    threadId:
      row.meta?.threadId ??
      row.logs_tail?.match(/^\[thread ([^\]]+)\]/)?.[1] ??
      null,
    logsTail: row.logs_tail,
    meta: row.meta ?? null,
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
