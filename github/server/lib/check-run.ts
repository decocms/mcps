/**
 * Check run detail fetch.
 *
 * The upstream github-mcp `pull_request_read(get_check_runs)` returns a minimal
 * shape that omits `output` (title/summary/text) to save context. The PR panel
 * needs that output to show a check's step-by-step results inline, so this
 * fetches a single check run in full from the GitHub REST API.
 *
 * Reads use the caller's own token (a repo-scoped installation token with
 * checks:read, or a user-to-server token) — no GitHub App private key needed.
 */

const GITHUB_API = "https://api.github.com";

export interface CheckRunOutput {
  title: string | null;
  summary: string | null;
  text: string | null;
}

export interface CheckRunDetail {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string | null;
  detailsUrl: string | null;
  output: CheckRunOutput;
}

export type CheckRunErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "not_found"
  | "upstream_error";

/** Error surfaced by GET_CHECK_RUN. `code` is stable; `message` is safe to show
 * (it never contains the caller token). */
export class CheckRunError extends Error {
  constructor(
    public readonly code: CheckRunErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CheckRunError";
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

function assertValidSegment(kind: "owner" | "repo", value: string): void {
  if (!SEGMENT_RE.test(value) || value === "." || value === "..") {
    throw new CheckRunError(
      "invalid_input",
      `"${kind}" contains invalid characters.`,
    );
  }
}

/**
 * Fetch a single check run by numeric id, including its `output`. Throws a
 * {@link CheckRunError} on missing auth, bad input, or a non-OK GitHub response.
 */
export async function getCheckRun(params: {
  token: string;
  owner: string;
  repo: string;
  checkRunId: number;
}): Promise<CheckRunDetail> {
  const { token, owner, repo, checkRunId } = params;

  if (!token) {
    throw new CheckRunError(
      "unauthorized",
      "Missing caller GitHub authorization.",
    );
  }
  if (!owner || !repo) {
    throw new CheckRunError(
      "invalid_input",
      `"owner" and "repo" are required.`,
    );
  }
  assertValidSegment("owner", owner);
  assertValidSegment("repo", repo);
  if (!Number.isInteger(checkRunId) || checkRunId <= 0) {
    throw new CheckRunError(
      "invalid_input",
      `"checkRunId" must be a positive integer.`,
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo,
      )}/check-runs/${checkRunId}`,
      { headers: githubHeaders(token) },
    );
  } catch {
    throw new CheckRunError(
      "upstream_error",
      "GitHub is temporarily unavailable. Please retry.",
    );
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new CheckRunError(
        "unauthorized",
        `Not authorized to read check run ${checkRunId} (${res.status}). ` +
          "The token may lack checks:read.",
      );
    }
    if (res.status === 404) {
      throw new CheckRunError(
        "not_found",
        `Check run ${checkRunId} was not found in ${owner}/${repo}.`,
      );
    }
    throw new CheckRunError(
      "upstream_error",
      `GitHub returned ${res.status} while reading check run ${checkRunId}.`,
    );
  }

  let data: {
    id?: number;
    name?: string;
    status?: string;
    conclusion?: string | null;
    html_url?: string | null;
    details_url?: string | null;
    output?: {
      title?: string | null;
      summary?: string | null;
      text?: string | null;
    };
  };
  try {
    data = await res.json();
  } catch {
    throw new CheckRunError(
      "upstream_error",
      "GitHub returned an unreadable response.",
    );
  }

  return {
    id: data.id ?? checkRunId,
    name: data.name ?? "",
    // Don't assert a terminal state on a malformed payload — "unknown" keeps a
    // missing status from rendering as a finished check.
    status: data.status ?? "unknown",
    conclusion: data.conclusion ?? null,
    htmlUrl: data.html_url ?? null,
    detailsUrl: data.details_url ?? null,
    output: {
      title: data.output?.title ?? null,
      summary: data.output?.summary ?? null,
      text: data.output?.text ?? null,
    },
  };
}
