/** Row types + status machine vocabulary for the sitemig_* tables. */

export type SiteStatus =
  | "queued"
  | "creating_repo"
  | "provisioning_sandbox"
  | "migrating"
  | "migrating2"
  | "installing_sync"
  | "validating"
  | "validating2"
  | "deploying_cf"
  | "done"
  | "needs_human"
  | "paused"
  | "failed"
  | "archived";

/**
 * Statuses that occupy a queue slot (count toward MAX_CONCURRENT).
 *
 * `migrating2`/`validating2` are the session-phase names since v0.2.3:
 * stale platform replicas (old builds keep Running after every publish)
 * filter their queries by the OLD status list, so sites parked in the
 * v2 names are INVISIBLE to them — only fresh workers run sessions.
 * New workers still list the old names to translate leftovers.
 */
export const ACTIVE_STATUSES: SiteStatus[] = [
  "creating_repo",
  "provisioning_sandbox",
  "migrating",
  "migrating2",
  "installing_sync",
  "validating",
  "validating2",
  "deploying_cf",
];

/** Old session-phase names → zombie-invisible v2 names. */
export function toV2Status(status: SiteStatus): SiteStatus {
  if (status === "migrating") return "migrating2";
  if (status === "validating") return "validating2";
  return status;
}

export function isMigratingStatus(status: string): boolean {
  return status === "migrating" || status === "migrating2";
}

export function isValidatingStatus(status: string): boolean {
  return status === "validating" || status === "validating2";
}

/** Statuses a site can be resumed/retried from. */
export const RESUMABLE_STATUSES: SiteStatus[] = [
  "failed",
  "needs_human",
  "paused",
];

export const TERMINAL_STATUSES: SiteStatus[] = ["done", "archived"];

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_STATUSES as string[]).includes(status);
}

export type RunKind =
  | "migrate"
  | "parity"
  | "fix_iteration"
  | "install_sync"
  | "deploy_cf";

export type RunStatus = "running" | "succeeded" | "failed";

export interface ConnectionRow {
  connection_id: string;
  organization_id: string;
  mesh_url: string;
  mesh_token: string | null;
  mesh_api_key: string | null;
  state: Record<string, unknown> | null;
  configured_at: string;
  updated_at: string;
}

export interface SiteRow {
  id: string;
  connection_id: string;
  name: string;
  source_repo: string;
  source_branch: string;
  prod_url: string;
  target_repo: string | null;

  status: SiteStatus;
  phase_detail: string | null;
  error: string | null;
  needs_human_reason: string | null;
  resume_status: SiteStatus | null;

  parity_score: number | null;
  parity_target: number;
  max_iterations: number;
  no_improve_limit: number;
  iterations_done: number;
  no_improve_count: number;
  best_score: number | null;

  sandbox_handle: string | null;
  sandbox_preview_url: string | null;
  sandbox_session_id: string | null;
  virtual_mcp_id: string | null;

  gh_refresh_token: string | null;
  gh_token_endpoint: string | null;
  gh_client_id: string | null;

  cf_project_name: string | null;
  cf_deploy_url: string | null;

  lease_owner: string | null;
  lease_expires_at: string | null;

  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  last_progress_at: string | null;
}

/** Trimmed parity report stored in sitemig_runs.summary (full report goes to object storage). */
export interface ParitySummary {
  verdict?: {
    status: "pass" | "warn" | "fail";
    score: number;
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
  };
  parityOk?: boolean;
  topIssues?: Array<{
    severity: string;
    category?: string;
    page?: string;
    summary: string;
    suggestedFix?: string;
  }>;
  perPage?: Array<{
    pagePath: string;
    viewport?: string;
    pctDiff?: number;
    verdict?: string;
    sectionsOnlyInProd?: string[];
  }>;
}

export interface RunRow {
  id: string;
  site_id: string;
  kind: RunKind;
  iteration: number;
  status: RunStatus;
  parity_score: number | null;
  summary: ParitySummary | null;
  artifact_prefix: string | null;
  logs_tail: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface EventRow {
  id: number;
  site_id: string | null;
  level: "info" | "warn" | "error";
  message: string;
  created_at: string;
}
