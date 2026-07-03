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
