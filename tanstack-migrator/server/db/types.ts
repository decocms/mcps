/** Row types + status machine vocabulary for the sitemig_* tables. */

export type SiteStatus =
  // current pipeline (v0.5.0 issue-driven, branch + PR)
  | "draft"
  | "queued"
  | "creating_repo"
  | "provisioning_sandbox"
  | "baselining"
  | "migrating_script"
  | "opening_pr"
  | "triaging"
  | "fixing"
  | "paritying"
  | "deploying"
  | "awaiting_merge"
  // legacy names (≤ v0.4.x) — kept only so the sweep can translate leftovers.
  // deploying_cf is legacy too: old workers would run THEIR handler on it and
  // mark the site done, bypassing the merge gate.
  | "migrating"
  | "migrating2"
  | "migrating3"
  | "installing_sync"
  | "validating"
  | "validating2"
  | "validating3"
  | "deploying_cf"
  // terminal / parked
  | "done"
  | "needs_human"
  | "paused"
  | "failed"
  | "archived";

/**
 * Statuses that occupy a queue slot (count toward MAX_CONCURRENT).
 *
 * The v0.5.0 names are inherently zombie-safe: stale platform replicas (old
 * builds keep Running after every publish) filter their queries by THEIR
 * status list, which doesn't contain these names — only fresh workers see
 * them. Legacy names stay listed so fresh workers still find leftovers to
 * translate (see toCurrentStatus).
 */
export const ACTIVE_STATUSES: SiteStatus[] = [
  "creating_repo",
  "provisioning_sandbox",
  "baselining",
  "migrating_script",
  "opening_pr",
  "triaging",
  "fixing",
  "paritying",
  "deploying",
  // legacy (translated on sight by the worker sweep)
  "migrating",
  "migrating2",
  "migrating3",
  "installing_sync",
  "validating",
  "validating2",
  "validating3",
  "deploying_cf",
];

/**
 * Waiting on a human to merge the PR: doesn't hold a queue slot, but the
 * worker still polls the PR state each tick to flip it to done.
 */
export const POLLING_STATUSES: SiteStatus[] = ["awaiting_merge"];

/** Legacy (≤ v0.4.x) status names → their v0.5.0 pipeline equivalent. */
export function toCurrentStatus(status: SiteStatus): SiteStatus {
  switch (status) {
    case "migrating":
    case "migrating2":
    case "migrating3":
      return "migrating_script";
    case "installing_sync":
      return "opening_pr";
    case "validating":
    case "validating2":
    case "validating3":
      // re-triage is the correct resume for in-flight parity-loop sites:
      // it rebuilds the backlog before spending fix sessions
      return "triaging";
    case "deploying_cf":
      return "deploying";
    default:
      return status;
  }
}

export function isLegacyStatus(status: string): boolean {
  return (
    status === "migrating" ||
    status === "migrating2" ||
    status === "migrating3" ||
    status === "installing_sync" ||
    status === "validating" ||
    status === "validating2" ||
    status === "validating3" ||
    status === "deploying_cf"
  );
}

/** Phases whose work happens inside a bounded decopilot session in the sandbox. */
export function isSessionStatus(status: string): boolean {
  return (
    status === "baselining" ||
    status === "migrating_script" ||
    status === "triaging" ||
    status === "fixing" ||
    status === "paritying" ||
    isLegacyStatus(status)
  );
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
  | "triage"
  | "fix"
  | "parity"
  | "fix_iteration" // legacy (≤ v0.4.x)
  | "install_sync"
  | "deploy_cf";

export type RunStatus = "running" | "succeeded" | "failed";

/** Structured per-run telemetry stored in sitemig_runs.meta. */
export interface RunMeta {
  /** Session cost from MONITORING_THREAD_USAGE. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  };
  /** Bash commands the session ran (from the thread's tool parts). */
  commands?: Array<{ cmd: string; exit?: number }>;
  /** Issue movement in this run (GitHub issue numbers). */
  issues?: {
    taken?: number[];
    resolved?: number[];
    blocked?: Array<{ number: number; reason?: string }>;
    created?: number;
  };
  threadId?: string;
}

export interface ConnectionRow {
  connection_id: string;
  organization_id: string;
  mesh_url: string;
  mesh_token: string | null;
  mesh_api_key: string | null;
  state: Record<string, unknown> | null;
  /** Tamper-proof keys — old replicas rewrite `state` but never this column. */
  pinned: Record<string, unknown> | null;
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
  /** Parity-score stagnation counter (rounds without improvement). */
  no_improve_count: number;
  /** Zombie-replica transient retry counter (separate control loop). */
  transient_retries: number;
  best_score: number | null;

  // issue backlog caches (source of truth is GitHub)
  issues_total: number;
  issues_open: number;
  issues_closed: number;
  fix_sessions_done: number;
  max_fix_sessions: number;

  // branch + PR (merge = go-live)
  work_branch: string;
  pr_number: number | null;
  pr_url: string | null;

  sandbox_handle: string | null;
  sandbox_preview_url: string | null;
  preview_ready: boolean;
  sandbox_session_id: string | null;
  virtual_mcp_id: string | null;
  /** Decopilot thread reused for follow-up messages within the same phase. */
  phase_thread_id: string | null;

  gh_refresh_token: string | null;
  gh_token_endpoint: string | null;
  gh_client_id: string | null;

  cf_project_name: string | null;
  cf_deploy_url: string | null;

  queue_position: number | null;
  cost_total: number;

  baseline_score: number | null;
  baseline_measured_at: string | null;
  baseline_report_prefix: string | null;
  baseline_verdict: ParitySummary | null;

  assignee_login: string | null;
  assignee_avatar_url: string | null;

  cost_before_usd: number | null;
  cost_before_at: string | null;

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
  meta: RunMeta | null;
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
