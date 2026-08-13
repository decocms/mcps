/**
 * Preview deployment lookup.
 *
 * Some hosts (notably VTEX FastStore WebOps) publish a PR's preview URL neither
 * as a commit-status `target_url` nor as a bot comment — the two sources the PR
 * panel already reads. They record it as a GitHub **Deployment** whose latest
 * `deployment_status.environment_url` points at the per-branch preview (e.g.
 * `https://<hash>--<store>.preview.vtex.app`).
 *
 * The upstream github-mcp `pull_request_read` has no deployments method, so this
 * first-party tool fills the gap by reading the REST Deployments API directly
 * with the caller's own token — same shape as `getCheckRun`.
 *
 * Reads use the caller's token (a repo-scoped installation token with
 * `deployments:read`/`repo`, or a user-to-server token) — no GitHub App private
 * key needed.
 */

const GITHUB_API = "https://api.github.com";

/** How many deployments (newest-first) to inspect for a sha before giving up.
 * A single commit usually has 1–2 (staging + production); the cap bounds the
 * status fan-out on pathological histories. */
const MAX_DEPLOYMENTS_SCANNED = 10;

/** How many statuses (newest-first) to read per deployment. */
const STATUSES_PER_PAGE = 30;

export interface DeploymentPreview {
  /** `environment_url` of the newest matching successful deployment status, or
   * null when no deployment for the sha has published one. */
  environmentUrl: string | null;
  /** The deployment's environment (e.g. "staging", "production"), or null. */
  environment: string | null;
  /** The winning status's state (always "success" when environmentUrl is set). */
  state: string | null;
  /** The deployment id the url came from, or null. */
  deploymentId: number | null;
}

export type DeploymentErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "not_found"
  | "upstream_error";

/** Error surfaced by GET_PREVIEW_DEPLOYMENT. `code` is stable; `message` is safe
 * to show (it never contains the caller token). */
export class DeploymentError extends Error {
  constructor(
    public readonly code: DeploymentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DeploymentError";
  }
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "deco-cms-github-mcp",
  };
}

/**
 * GitHub owner/repo path segments: alphanumerics plus `.`, `_`, `-`. Rejecting
 * anything else (and the bare `.`/`..`) closes path/endpoint injection — an
 * unvalidated `/` or `..` would let the caller re-target a different
 * api.github.com endpoint once the URL parser normalizes the path. Segments are
 * also `encodeURIComponent`-d at the call site as defense in depth.
 */
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
/** A git sha: 7–40 hex chars. Also the `sha` query value, so it's validated
 * for the same injection reason as the path segments. */
const SHA_RE = /^[0-9a-fA-F]{7,40}$/;

function assertValidSegment(kind: "owner" | "repo", value: string): void {
  if (!SEGMENT_RE.test(value) || value === "." || value === "..") {
    throw new DeploymentError(
      "invalid_input",
      `"${kind}" contains invalid characters.`,
    );
  }
}

async function githubGet(
  url: string,
  token: string,
  what: string,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers: githubHeaders(token) });
  } catch {
    throw new DeploymentError(
      "upstream_error",
      "GitHub is temporarily unavailable. Please retry.",
    );
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new DeploymentError(
        "unauthorized",
        `Not authorized to read ${what} (${res.status}). ` +
          "The token may lack deployments:read.",
      );
    }
    if (res.status === 404) {
      throw new DeploymentError("not_found", `${what} was not found.`);
    }
    throw new DeploymentError(
      "upstream_error",
      `GitHub returned ${res.status} while reading ${what}.`,
    );
  }
  return res;
}

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new DeploymentError(
      "upstream_error",
      "GitHub returned an unreadable response.",
    );
  }
}

interface DeploymentRow {
  id?: number;
  environment?: string | null;
}
interface DeploymentStatusRow {
  state?: string | null;
  environment_url?: string | null;
}

/**
 * Find the preview URL for a commit by scanning its GitHub Deployments,
 * newest-first, and returning the first `success` status that carries an
 * `environment_url`. Returns `environmentUrl: null` (not an error) when the sha
 * has deployments but none has published a url yet — an in-flight deploy is a
 * normal, non-exceptional state. Throws {@link DeploymentError} on missing auth,
 * bad input, or a non-OK GitHub response.
 */
export async function getPreviewDeployment(params: {
  token: string;
  owner: string;
  repo: string;
  sha: string;
  /** Optional environment filter (e.g. "staging"). Omitted → any environment. */
  environment?: string;
}): Promise<DeploymentPreview> {
  const { token, owner, repo, sha, environment } = params;

  if (!token) {
    throw new DeploymentError(
      "unauthorized",
      "Missing caller GitHub authorization.",
    );
  }
  if (!owner || !repo || !sha) {
    throw new DeploymentError(
      "invalid_input",
      `"owner", "repo" and "sha" are required.`,
    );
  }
  assertValidSegment("owner", owner);
  assertValidSegment("repo", repo);
  if (!SHA_RE.test(sha)) {
    throw new DeploymentError(
      "invalid_input",
      `"sha" must be a 7–40 character hex git sha.`,
    );
  }
  if (environment !== undefined && !SEGMENT_RE.test(environment)) {
    throw new DeploymentError(
      "invalid_input",
      `"environment" contains invalid characters.`,
    );
  }

  const base = `${GITHUB_API}/repos/${encodeURIComponent(
    owner,
  )}/${encodeURIComponent(repo)}`;

  const deploymentsUrl =
    `${base}/deployments?sha=${sha}&per_page=${MAX_DEPLOYMENTS_SCANNED}` +
    (environment ? `&environment=${encodeURIComponent(environment)}` : "");
  const deployments = await readJson<DeploymentRow[]>(
    await githubGet(deploymentsUrl, token, `deployments for ${owner}/${repo}`),
  );

  const empty: DeploymentPreview = {
    environmentUrl: null,
    environment: null,
    state: null,
    deploymentId: null,
  };
  if (!Array.isArray(deployments) || deployments.length === 0) {
    return empty;
  }

  // Deployments come newest-first; the first one with a published preview url
  // wins. Statuses are likewise newest-first, so the first `success` carrying an
  // environment_url is the current one.
  for (const dep of deployments.slice(0, MAX_DEPLOYMENTS_SCANNED)) {
    if (typeof dep?.id !== "number") continue;
    const statuses = await readJson<DeploymentStatusRow[]>(
      await githubGet(
        `${base}/deployments/${dep.id}/statuses?per_page=${STATUSES_PER_PAGE}`,
        token,
        `deployment ${dep.id} statuses`,
      ),
    );
    if (!Array.isArray(statuses)) continue;
    const hit = statuses.find(
      (s) =>
        s?.state === "success" &&
        typeof s.environment_url === "string" &&
        s.environment_url.length > 0,
    );
    if (hit) {
      return {
        environmentUrl: hit.environment_url ?? null,
        environment: dep.environment ?? null,
        state: hit.state ?? null,
        deploymentId: dep.id,
      };
    }
  }

  return empty;
}
