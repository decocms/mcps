/**
 * GitHub operations via the GITHUB binding (deco github MCP, which proxies
 * the official GitHub MCP tools + first-party MINT_REPO_TOKEN).
 *
 * Tool names (create_repository, get_file_contents, create_or_update_file)
 * are the official GitHub MCP ones, discovered dynamically by the proxy.
 */

import type { SiteRow } from "../db/types.ts";
import { callBindingTool, type WorkerCtx } from "./mesh.ts";

export interface RepoRef {
  owner: string;
  repo: string;
}

export function parseRepo(full: string): RepoRef {
  const [owner, repo] = full.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo ref: ${full}`);
  return { owner, repo };
}

export function targetRepoFor(site: SiteRow, org: string): string {
  const { repo } = parseRepo(site.source_repo);
  return `${org}/${repo}-tanstack`;
}

/** Thrown when the GitHub App lacks org repo-creation permission (403). */
export class RepoCreatePermissionError extends Error {}

/** Does the repo exist/is it reachable with the current GitHub credentials? */
export async function repoExists(
  ctx: WorkerCtx,
  full: string,
): Promise<boolean> {
  const ref = parseRepo(full);
  try {
    const raw = await callBindingTool(ctx, "GITHUB", "get_file_contents", {
      owner: ref.owner,
      repo: ref.repo,
      path: "/",
    });
    return raw !== null && raw !== undefined;
  } catch (err) {
    // GitHub answers 404 "This repository is empty" for existing empty repos
    const message = err instanceof Error ? err.message : String(err);
    return /repository is empty/i.test(message);
  }
}

/**
 * Idempotent: create the -tanstack repo, treating "already exists" as
 * success. Created EMPTY (no autoInit) so the migration's initial push
 * doesn't diverge from a README commit.
 */
export async function ensureRepo(ctx: WorkerCtx, full: string): Promise<void> {
  const { owner, repo } = parseRepo(full);
  // Cheap existence check first — also covers manually-created repos.
  if (await repoExists(ctx, full)) return;

  try {
    await callBindingTool(ctx, "GITHUB", "create_repository", {
      name: repo,
      organization: owner,
      description: `TanStack Start migration of ${repo} — managed by tanstack-migrator`,
      private: true,
      autoInit: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already exists|name already exists/i.test(message)) return;
    if (/403|not accessible by integration|forbidden/i.test(message)) {
      throw new RepoCreatePermissionError(
        `GitHub App sem permissão para criar repositórios na org ${owner} (${message})`,
      );
    }
    throw err;
  }
}

/**
 * Idempotent: create the work branch off `from`. The branch must exist on
 * GitHub BEFORE SANDBOX_START — the sandbox clone and the decopilot threads
 * are pinned to it, and the (user, branch) pair routes sessions into the vm.
 */
export async function ensureBranch(
  ctx: WorkerCtx,
  ref: RepoRef,
  branch: string,
  from = "main",
): Promise<void> {
  try {
    await callBindingTool(ctx, "GITHUB", "create_branch", {
      owner: ref.owner,
      repo: ref.repo,
      branch,
      from_branch: from,
    });
  } catch (err) {
    // only explicit already-exists counts as success — a generic 422 would
    // silently continue with a missing work branch
    const message = err instanceof Error ? err.message : String(err);
    if (/already exists|reference already exists/i.test(message)) return;
    throw err;
  }
}

export interface RepoGrant {
  token: string;
  expiresAt?: string;
  refreshToken?: string;
  tokenEndpoint?: string;
  clientId?: string;
}

/**
 * Mint a repo-scoped ghs_ token (+ durable ghr_ refresh grant) for the target
 * repo. The grant lets the worker re-mint fresh 1h tokens for hours-long
 * sandbox work without a user login.
 */
export async function mintRepoGrant(
  ctx: WorkerCtx,
  full: string,
): Promise<RepoGrant> {
  const installationId = ctx.config.githubInstallationId;
  if (!installationId) {
    throw new Error(
      "GITHUB_INSTALLATION_ID is not configured — set it in the MCP state (GitHub App installation for the deco-sites org).",
    );
  }
  const { owner, repo } = parseRepo(full);
  const result = await callBindingTool<{
    token: string;
    expiresAt?: string;
    refreshToken?: string;
    tokenEndpoint?: string;
    clientId?: string;
  }>(ctx, "GITHUB", "MINT_REPO_TOKEN", {
    installationId,
    owner,
    repo,
    permissions: { contents: "write", metadata: "read" },
  });
  if (!result?.token) {
    throw new Error("MINT_REPO_TOKEN returned no token");
  }
  return result;
}

/** Redeem the stored ghr_ grant for a fresh ghs_ token (OAuth refresh flow). */
export async function refreshGhsToken(site: SiteRow): Promise<string> {
  if (!site.gh_refresh_token || !site.gh_token_endpoint) {
    throw new Error(`Site ${site.name} has no stored GitHub grant`);
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: site.gh_refresh_token,
  });
  if (site.gh_client_id) body.set("client_id", site.gh_client_id);

  const response = await fetch(site.gh_token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok) {
    throw new Error(
      `GitHub grant refresh failed (${response.status}): ${payload.error_description ?? payload.error ?? "unknown"}`,
    );
  }
  const token = payload.access_token ?? payload.token;
  if (!token) throw new Error("GitHub grant refresh returned no token");
  return token;
}

/**
 * ghs_ token for sandbox git operations: refresh the grant, or mint anew.
 * OPTIONAL — returns {token: undefined} when no grant is stored and no
 * installation id is configured; in that case the sandbox relies on the git
 * credentials the mesh syncs for the virtualMcp's githubRepo connection.
 */
export async function ghsTokenForSite(
  ctx: WorkerCtx,
  site: SiteRow,
): Promise<{ token?: string; grant?: RepoGrant }> {
  if (site.gh_refresh_token && site.gh_token_endpoint) {
    try {
      return { token: await refreshGhsToken(site) };
    } catch {
      // fall through to a fresh mint (grant may have expired/revoked)
    }
  }
  if (!ctx.config.githubInstallationId) {
    return { token: undefined };
  }
  try {
    const grant = await mintRepoGrant(ctx, site.target_repo ?? "");
    return { token: grant.token, grant };
  } catch {
    return { token: undefined };
  }
}

// ============================================================================
// Issues + PRs — the durable memory of the v0.5.0 pipeline.
//
// The binding proxies the official GitHub MCP server, whose arg shapes vary
// by version (consolidated issue_write/pull_request_read vs the older
// create_issue/get_pull_request; state enums upper vs lower case). Every
// wrapper parses tolerantly and retries the known shape variants.
// ============================================================================

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  htmlUrl?: string;
}

/** Unwrap {item}/{data}/{issue}/array envelopes the proxy may add. */
function unwrapItem(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const candidate = Array.isArray(obj)
    ? obj[0]
    : (obj.issue ?? obj.pull_request ?? obj.item ?? obj.data ?? obj);
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as Record<string, unknown>;
}

function unwrapList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  for (const key of ["issues", "items", "data", "nodes"]) {
    if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
  }
  return [];
}

function toIssue(raw: Record<string, unknown>): GithubIssue | null {
  const rawUrl =
    typeof raw.html_url === "string"
      ? raw.html_url
      : typeof raw.url === "string"
        ? raw.url
        : undefined;
  let number = typeof raw.number === "number" ? raw.number : undefined;
  if (number === undefined && rawUrl) {
    // the proxy's issue_write create answers only {id, url}
    const match = rawUrl.match(/\/issues\/(\d+)/);
    if (match) number = Number(match[1]);
  }
  if (number === undefined) return null;
  const labels = Array.isArray(raw.labels)
    ? (raw.labels as unknown[])
        .map((l) =>
          typeof l === "string"
            ? l
            : typeof (l as Record<string, unknown>)?.name === "string"
              ? ((l as Record<string, unknown>).name as string)
              : "",
        )
        .filter(Boolean)
    : [];
  return {
    number,
    title: typeof raw.title === "string" ? raw.title : "",
    body: typeof raw.body === "string" ? raw.body : "",
    state: typeof raw.state === "string" ? raw.state.toLowerCase() : "open",
    labels,
    htmlUrl: typeof raw.html_url === "string" ? raw.html_url : undefined,
  };
}

function isUnknownToolError(message: string): boolean {
  return /unknown tool|tool .+ not found|no such tool|method not found/i.test(
    message,
  );
}

export async function createIssue(
  ctx: WorkerCtx,
  ref: RepoRef,
  input: { title: string; body: string; labels?: string[] },
): Promise<GithubIssue> {
  const args = {
    method: "create",
    owner: ref.owner,
    repo: ref.repo,
    title: input.title,
    body: input.body,
    ...(input.labels?.length ? { labels: input.labels } : {}),
  };
  let raw: unknown;
  try {
    raw = await callBindingTool(ctx, "GITHUB", "issue_write", args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isUnknownToolError(message)) {
      const { method: _m, ...rest } = args;
      raw = await callBindingTool(ctx, "GITHUB", "create_issue", rest);
    } else if (input.labels?.length && /label|422|validation/i.test(message)) {
      // labels may not exist yet / label create may be forbidden — retry bare
      return await createIssue(ctx, ref, { ...input, labels: undefined });
    } else {
      throw err;
    }
  }
  const issue = toIssue(unwrapItem(raw) ?? {});
  if (!issue) {
    throw new Error(
      `issue create returned no number: ${JSON.stringify(raw).slice(0, 200)}`,
    );
  }
  return issue;
}

async function issueUpdate(
  ctx: WorkerCtx,
  ref: RepoRef,
  issueNumber: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const args = {
    method: "update",
    owner: ref.owner,
    repo: ref.repo,
    issue_number: issueNumber,
    ...patch,
  };
  try {
    await callBindingTool(ctx, "GITHUB", "issue_write", args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isUnknownToolError(message)) throw err;
    const { method: _m, ...rest } = args;
    await callBindingTool(ctx, "GITHUB", "update_issue", rest);
  }
}

export async function updateIssueBody(
  ctx: WorkerCtx,
  ref: RepoRef,
  issueNumber: number,
  body: string,
): Promise<void> {
  await issueUpdate(ctx, ref, issueNumber, { body });
}

/** Replace the issue's label set (pass the merged list — GitHub overwrites). */
export async function issueUpdateLabels(
  ctx: WorkerCtx,
  ref: RepoRef,
  issueNumber: number,
  labels: string[],
): Promise<void> {
  await issueUpdate(ctx, ref, issueNumber, {
    labels: [...new Set(labels)],
  });
}

export async function closeIssue(
  ctx: WorkerCtx,
  ref: RepoRef,
  issueNumber: number,
  reason: "completed" | "not_planned" = "completed",
): Promise<void> {
  try {
    await issueUpdate(ctx, ref, issueNumber, {
      state: "closed",
      state_reason: reason,
    });
  } catch (err) {
    // some server versions reject state_reason — closing is what matters
    const message = err instanceof Error ? err.message : String(err);
    if (!/state_reason|invalid/i.test(message)) throw err;
    await issueUpdate(ctx, ref, issueNumber, { state: "closed" });
  }
}

export async function commentIssue(
  ctx: WorkerCtx,
  ref: RepoRef,
  issueNumber: number,
  body: string,
): Promise<void> {
  await callBindingTool(ctx, "GITHUB", "add_issue_comment", {
    owner: ref.owner,
    repo: ref.repo,
    issue_number: issueNumber,
    body,
  });
}

export async function listIssues(
  ctx: WorkerCtx,
  ref: RepoRef,
  input: { state: "open" | "closed"; labels?: string[] },
): Promise<GithubIssue[]> {
  const base = {
    owner: ref.owner,
    repo: ref.repo,
    ...(input.labels?.length ? { labels: input.labels } : {}),
    perPage: 100,
  };
  let raw: unknown;
  try {
    raw = await callBindingTool(ctx, "GITHUB", "list_issues", {
      ...base,
      state: input.state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // GraphQL-backed versions want the enum uppercase
    if (!/state|enum|invalid|validation/i.test(message)) throw err;
    raw = await callBindingTool(ctx, "GITHUB", "list_issues", {
      ...base,
      state: input.state.toUpperCase(),
    });
  }
  return unwrapList(raw)
    .map(toIssue)
    .filter((i): i is GithubIssue => i !== null);
}

export interface PullRequestInfo {
  number: number;
  url?: string;
  state: string;
  merged: boolean;
}

function toPullRequest(raw: Record<string, unknown>): PullRequestInfo | null {
  const url =
    typeof raw.html_url === "string"
      ? raw.html_url
      : typeof raw.url === "string" && raw.url.includes("/pull/")
        ? raw.url
        : undefined;
  let number = typeof raw.number === "number" ? raw.number : undefined;
  if (number === undefined && url) {
    // the proxy's create_pull_request answers only {id, url} — the number
    // lives in the URL path
    const match = url.match(/\/pull\/(\d+)/);
    if (match) number = Number(match[1]);
  }
  if (number === undefined) return null;
  const state = typeof raw.state === "string" ? raw.state.toLowerCase() : "";
  const merged =
    raw.merged === true ||
    typeof raw.merged_at === "string" ||
    typeof raw.mergedAt === "string" ||
    state === "merged";
  return { number, url, state, merged };
}

export async function createPullRequest(
  ctx: WorkerCtx,
  ref: RepoRef,
  input: { title: string; body: string; head: string; base: string },
): Promise<PullRequestInfo> {
  const args = {
    owner: ref.owner,
    repo: ref.repo,
    title: input.title,
    body: input.body,
    head: input.head,
    base: input.base,
  };
  let raw: unknown;
  try {
    raw = await callBindingTool(ctx, "GITHUB", "create_pull_request", args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isUnknownToolError(message)) throw err;
    raw = await callBindingTool(ctx, "GITHUB", "pull_request_write", {
      method: "create",
      ...args,
    });
  }
  const pr = toPullRequest(unwrapItem(raw) ?? {});
  if (!pr) {
    throw new Error(
      `PR create returned no number: ${JSON.stringify(raw).slice(0, 200)}`,
    );
  }
  return pr;
}

/** Open PR whose head is `branch` — how a re-run reuses the existing PR. */
export async function findOpenPullRequest(
  ctx: WorkerCtx,
  ref: RepoRef,
  branch: string,
): Promise<PullRequestInfo | null> {
  const attempts: Array<{
    tool: string;
    args: Record<string, unknown>;
    /** server already filtered by head — a row without head.ref is trustable */
    serverFiltered: boolean;
  }> = [
    {
      tool: "list_pull_requests",
      args: {
        owner: ref.owner,
        repo: ref.repo,
        state: "open",
        head: `${ref.owner}:${branch}`,
      },
      serverFiltered: true,
    },
    {
      tool: "list_pull_requests",
      args: { owner: ref.owner, repo: ref.repo, state: "open" },
      serverFiltered: false,
    },
  ];
  for (const attempt of attempts) {
    try {
      const raw = await callBindingTool(
        ctx,
        "GITHUB",
        attempt.tool,
        attempt.args,
      );
      const rows = unwrapList(raw);
      for (const row of rows) {
        const pr = toPullRequest(row);
        if (!pr) continue;
        const head = row.head as Record<string, unknown> | undefined;
        const headRef = typeof head?.ref === "string" ? head.ref : undefined;
        // never bind the site to an unrelated PR: exact branch match, or a
        // missing head.ref ONLY when the server itself did the filtering
        if (headRef === branch) return pr;
        if (headRef === undefined && attempt.serverFiltered) return pr;
      }
    } catch {
      // try the next shape
    }
  }
  return null;
}

export async function getPullRequest(
  ctx: WorkerCtx,
  ref: RepoRef,
  prNumber: number,
): Promise<PullRequestInfo | null> {
  const attempts: Array<{ tool: string; args: Record<string, unknown> }> = [
    {
      tool: "pull_request_read",
      args: {
        method: "get",
        owner: ref.owner,
        repo: ref.repo,
        pullNumber: prNumber,
      },
    },
    {
      tool: "pull_request_read",
      args: {
        method: "get",
        owner: ref.owner,
        repo: ref.repo,
        pull_number: prNumber,
      },
    },
    {
      tool: "get_pull_request",
      args: { owner: ref.owner, repo: ref.repo, pull_number: prNumber },
    },
  ];
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const raw = await callBindingTool(
        ctx,
        "GITHUB",
        attempt.tool,
        attempt.args,
      );
      const pr = toPullRequest(unwrapItem(raw) ?? {});
      if (pr) return pr;
    } catch (err) {
      lastError = err;
    }
  }
  const message =
    lastError instanceof Error ? lastError.message : String(lastError ?? "");
  if (/404|not found/i.test(message)) return null;
  throw lastError instanceof Error
    ? lastError
    : new Error(`getPullRequest failed: ${message}`);
}

interface FileContents {
  sha?: string;
  content?: string;
  encoding?: string;
}

function extractFileContents(raw: unknown): FileContents | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  // official MCP returns the GitHub contents API shape (possibly nested)
  const candidate = (
    Array.isArray(obj) ? obj[0] : (obj.file ?? obj.data ?? obj)
  ) as Record<string, unknown>;
  if (!candidate || typeof candidate !== "object") return null;
  const sha = typeof candidate.sha === "string" ? candidate.sha : undefined;
  const content =
    typeof candidate.content === "string" ? candidate.content : undefined;
  const encoding =
    typeof candidate.encoding === "string" ? candidate.encoding : undefined;
  if (!sha && !content) return null;
  return { sha, content, encoding };
}

export async function getFile(
  ctx: WorkerCtx,
  ref: RepoRef,
  path: string,
  branch = "main",
): Promise<{ sha?: string; text: string } | null> {
  try {
    const raw = await callBindingTool(ctx, "GITHUB", "get_file_contents", {
      owner: ref.owner,
      repo: ref.repo,
      path,
      ref: branch,
    });
    const file = extractFileContents(raw);
    if (!file) return null;
    let text = file.content ?? "";
    if (file.encoding === "base64" || /^[A-Za-z0-9+/=\n]+$/.test(text)) {
      try {
        text = Buffer.from(text.replace(/\n/g, ""), "base64").toString("utf-8");
      } catch {
        // keep raw text
      }
    }
    return { sha: file.sha, text };
  } catch {
    return null; // 404 → doesn't exist
  }
}

/** Idempotent create-or-update: skips the write when content already matches. */
export async function putFile(
  ctx: WorkerCtx,
  ref: RepoRef,
  input: { path: string; content: string; message: string; branch?: string },
): Promise<"created" | "updated" | "unchanged"> {
  const branch = input.branch ?? "main";
  const existing = await getFile(ctx, ref, input.path, branch);
  if (existing && existing.text.trim() === input.content.trim()) {
    return "unchanged";
  }

  await callBindingTool(ctx, "GITHUB", "create_or_update_file", {
    owner: ref.owner,
    repo: ref.repo,
    path: input.path,
    content: input.content,
    message: input.message,
    branch,
    ...(existing?.sha ? { sha: existing.sha } : {}),
  });
  return existing ? "updated" : "created";
}
