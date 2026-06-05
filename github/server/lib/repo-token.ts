/**
 * Repository-scoped GitHub token minting.
 *
 * Mints a GitHub App *installation access token* scoped to exactly ONE
 * repository with least-privilege permissions. The whole point is least
 * privilege: an imported agent must be able to touch ONLY its own repo.
 *
 * Security model — minting is gated on the CALLER's own authenticated GitHub
 * context, never on the raw input. We derive the caller's entitlement from
 * their user-to-server token (the token this MCP connection was established
 * with) before minting:
 *   1. The installation must appear in the caller's `GET /user/installations`
 *      AND its account login must equal `owner`.
 *   2. The repository must appear in the caller's
 *      `GET /user/installations/{id}/repositories`. That call also yields the
 *      numeric repo id, so we mint with `repository_ids` (rename-proof).
 * Only then do we mint, using the GitHub App's private key (JWT). GitHub
 * additionally enforces repo-in-installation and permission-subset (422).
 */

import {
  createAppJWT,
  GitHubAppApiError,
  mintInstallationAccessToken,
} from "./github-app-auth.ts";

export type RepoTokenErrorCode =
  | "invalid_input"
  | "unauthorized_caller"
  | "repo_not_accessible"
  | "permission_denied"
  | "installation_not_found"
  | "upstream_error"
  | "config_error";

/** Error surfaced by the MINT_REPO_TOKEN flow. `code` is stable; `message` is
 * safe to show to the caller (it never contains the minted token or upstream
 * auth detail). */
export class RepoTokenError extends Error {
  constructor(
    public readonly code: RepoTokenErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RepoTokenError";
  }
}

/**
 * Positive allowlist of permissions we are willing to mint — strictly
 * repo-content / PR / issue level. Anything outside this list is hard-rejected,
 * which by construction also rejects every escalation vector the spec bans
 * (administration, members, organization_*, secrets, actions, ...).
 */
export const ALLOWED_PERMISSIONS = new Set([
  "contents",
  "metadata",
  "pull_requests",
  "issues",
]);

/** GitHub permission levels we allow. `admin` is never granted. */
const ALLOWED_VALUES = new Set(["read", "write"]);

/** Default least-privilege grant for a coding agent (clone, read, push, PR). */
export const DEFAULT_PERMISSIONS: Record<string, string> = {
  contents: "write",
  metadata: "read",
  pull_requests: "write",
};

const GITHUB_API = "https://api.github.com";
const PER_PAGE = 100;

function githubHeaders(callerToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${callerToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "deco-cms-github-mcp",
  };
}

/**
 * Whether a non-OK GitHub response is transient (retry later) rather than a
 * definitive authorization/visibility failure. We must NOT collapse a GitHub
 * outage or rate-limit window into a hard "not authorized" / "not accessible"
 * denial — that would tell an entitled caller they permanently lost access.
 * Mirrors the 5xx-is-transient convention in github-client.ts.
 */
function isTransientGitHubResponse(res: Response): boolean {
  if (res.status >= 500 || res.status === 429) return true;
  // GitHub signals secondary/primary rate limits with a 403 plus either a
  // Retry-After header or an exhausted rate-limit budget.
  if (res.status === 403) {
    return (
      res.headers.get("retry-after") !== null ||
      res.headers.get("x-ratelimit-remaining") === "0"
    );
  }
  return false;
}

/**
 * Cap a requested permission map to the least-privilege allowlist.
 *
 * - No input → the default coding-agent grant.
 * - Each key must be in {@link ALLOWED_PERMISSIONS}; otherwise hard-reject.
 * - Each value must be "read" or "write"; `admin` (or anything else) is
 *   rejected.
 * - `metadata:read` is always required by GitHub, so it is forced in (and
 *   never elevated to write).
 */
export function capPermissions(
  input?: Record<string, string>,
): Record<string, string> {
  if (!input || Object.keys(input).length === 0) {
    return { ...DEFAULT_PERMISSIONS };
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_PERMISSIONS.has(key)) {
      throw new RepoTokenError(
        "permission_denied",
        `Permission "${key}" is not allowed. This tool only mints repo-scoped ` +
          `code access (${[...ALLOWED_PERMISSIONS].join(", ")}).`,
      );
    }
    if (!ALLOWED_VALUES.has(value)) {
      throw new RepoTokenError(
        "permission_denied",
        `Permission "${key}" must be "read" or "write" (got "${value}").`,
      );
    }
    out[key] = value;
  }

  // GitHub always requires metadata:read; never grant metadata:write.
  out.metadata = "read";
  return out;
}

/**
 * Verify the caller is entitled to `installationId` and that it belongs to
 * `owner`, by checking the caller's own `GET /user/installations`.
 * Returns the matching installation, or undefined if the caller has no such
 * installation. Throws on a non-OK response (e.g. 401 → caller token bad).
 */
async function findCallerInstallation(
  callerToken: string,
  installationId: number,
): Promise<{ id: number; account: { login: string } } | undefined> {
  let page = 1;
  while (true) {
    const res = await fetch(
      `${GITHUB_API}/user/installations?per_page=${PER_PAGE}&page=${page}`,
      { headers: githubHeaders(callerToken) },
    );
    if (!res.ok) {
      if (isTransientGitHubResponse(res)) {
        throw new RepoTokenError(
          "upstream_error",
          `GitHub is temporarily unavailable (${res.status}) while verifying ` +
            `the caller's installations. Please retry.`,
        );
      }
      throw new RepoTokenError(
        "unauthorized_caller",
        `Could not verify the caller's GitHub installations (${res.status}).`,
      );
    }
    const data = (await res.json()) as {
      installations: Array<{ id: number; account: { login: string } }>;
    };
    const match = data.installations.find((i) => i.id === installationId);
    if (match) return match;
    if (data.installations.length < PER_PAGE) return undefined;
    page++;
  }
}

/**
 * Find `owner/repo` within the caller's view of an installation and return its
 * numeric id (used for rename-proof minting). Returns undefined if the repo is
 * not present. Throws on a non-OK response (e.g. installation not accessible to
 * the caller).
 */
async function findRepoIdInInstallation(
  callerToken: string,
  installationId: number,
  owner: string,
  repo: string,
): Promise<number | undefined> {
  const ownerLc = owner.toLowerCase();
  const repoLc = repo.toLowerCase();
  let page = 1;
  while (true) {
    const res = await fetch(
      `${GITHUB_API}/user/installations/${installationId}/repositories` +
        `?per_page=${PER_PAGE}&page=${page}`,
      { headers: githubHeaders(callerToken) },
    );
    if (!res.ok) {
      if (isTransientGitHubResponse(res)) {
        throw new RepoTokenError(
          "upstream_error",
          `GitHub is temporarily unavailable (${res.status}) while listing ` +
            `repositories for installation ${installationId}. Please retry.`,
        );
      }
      throw new RepoTokenError(
        "repo_not_accessible",
        `Could not list repositories for installation ${installationId} ` +
          `(${res.status}).`,
      );
    }
    const data = (await res.json()) as {
      repositories: Array<{
        id: number;
        name: string;
        owner: { login: string };
      }>;
    };
    const match = data.repositories.find(
      (r) =>
        r.name.toLowerCase() === repoLc &&
        r.owner.login.toLowerCase() === ownerLc,
    );
    if (match) return match.id;
    if (data.repositories.length < PER_PAGE) return undefined;
    page++;
  }
}

/**
 * The security gate. Confirms the caller is entitled to `owner/repo` under
 * `installationId` using the caller's own GitHub context, and resolves the
 * repository's numeric id. Throws {@link RepoTokenError} (and mints nothing)
 * if the caller is not entitled.
 */
export async function authorizeAndResolveRepoId(params: {
  callerToken: string;
  installationId: number;
  owner: string;
  repo: string;
}): Promise<number> {
  const { callerToken, installationId, owner, repo } = params;

  if (!callerToken) {
    throw new RepoTokenError(
      "unauthorized_caller",
      "Missing caller GitHub authorization.",
    );
  }

  const installation = await findCallerInstallation(
    callerToken,
    installationId,
  );
  if (!installation) {
    throw new RepoTokenError(
      "unauthorized_caller",
      `Caller is not authorized for installation ${installationId}.`,
    );
  }
  if (installation.account.login.toLowerCase() !== owner.toLowerCase()) {
    throw new RepoTokenError(
      "unauthorized_caller",
      `Installation ${installationId} does not belong to "${owner}".`,
    );
  }

  const repoId = await findRepoIdInInstallation(
    callerToken,
    installationId,
    owner,
    repo,
  );
  if (repoId === undefined) {
    throw new RepoTokenError(
      "repo_not_accessible",
      `Repository "${owner}/${repo}" is not accessible to installation ` +
        `${installationId} for this caller.`,
    );
  }
  return repoId;
}

/**
 * Map an error from the mint endpoint to a clear, leak-free RepoTokenError.
 * RepoTokenErrors (from the authorization gate) pass through unchanged.
 */
export function mapMintError(err: unknown): RepoTokenError {
  if (err instanceof RepoTokenError) return err;
  if (err instanceof GitHubAppApiError) {
    if (err.status === 422) {
      return new RepoTokenError(
        "repo_not_accessible",
        "Repository is not in this installation, or the requested permissions " +
          "exceed what the GitHub App was granted.",
      );
    }
    if (err.status === 404) {
      return new RepoTokenError(
        "installation_not_found",
        "GitHub App installation not found.",
      );
    }
    if (err.status >= 500 || err.status === 429) {
      // Transient GitHub outage / rate limit — retryable, not a config issue.
      return new RepoTokenError(
        "upstream_error",
        "GitHub is temporarily unavailable while minting the token. Please retry.",
      );
    }
    // 401/403 (and anything else) → internal config problem; never leak the
    // upstream detail, which can hint at private-key/JWT internals.
    return new RepoTokenError(
      "config_error",
      "GitHub App authentication failed. This is a server configuration issue.",
    );
  }
  return new RepoTokenError(
    "config_error",
    "Unexpected error while minting the repository token.",
  );
}

export interface RepoTokenResult {
  token: string;
  expiresAt: string;
  permissions: Record<string, string>;
  repository: { owner: string; name: string };
  installationId: number;
}

/**
 * Mint a fresh, short-lived (~1h) repository-scoped GitHub token.
 *
 * Idempotent in the sense that the same inputs always produce a fresh valid
 * token (no caching, no refresh token). The `jwt` parameter is for testing;
 * production calls omit it so a real App JWT is signed from env.
 */
export async function mintRepoScopedToken(params: {
  callerToken: string;
  installationId: number;
  owner: string;
  repo: string;
  permissions?: Record<string, string>;
  jwt?: string;
}): Promise<RepoTokenResult> {
  const { callerToken, installationId, owner, repo, permissions, jwt } = params;

  if (!owner) {
    throw new RepoTokenError("invalid_input", `"owner" is required.`);
  }
  if (!repo || repo.includes("/")) {
    throw new RepoTokenError(
      "invalid_input",
      `"repo" must be a bare repository name, not "owner/repo" (got "${repo}").`,
    );
  }

  // Cap permissions BEFORE any network call so an over-broad request is
  // rejected without touching GitHub.
  const cappedPermissions = capPermissions(permissions);

  // Security gate — mints nothing if the caller is not entitled.
  const repositoryId = await authorizeAndResolveRepoId({
    callerToken,
    installationId,
    owner,
    repo,
  });

  let minted;
  try {
    minted = await mintInstallationAccessToken(
      installationId,
      { repository_ids: [repositoryId], permissions: cappedPermissions },
      jwt ?? createAppJWT(),
    );
  } catch (err) {
    throw mapMintError(err);
  }

  return {
    token: minted.token,
    expiresAt: minted.expires_at,
    permissions: minted.permissions,
    repository: { owner, name: repo },
    installationId,
  };
}
