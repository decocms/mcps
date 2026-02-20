/**
 * GitHub API Client for Reports
 *
 * Provides methods to interact with GitHub's Git Data and Contents APIs
 * for reading report files and managing lifecycle status persistence.
 *
 * Uses the Octokit REST client with an OAuth access token.
 */

import { Octokit } from "@octokit/rest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry from the Git Tree API (blob or tree). */
export interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

/** Decoded file content returned by the Contents API. */
export interface FileContent {
  path: string;
  sha: string;
  content: string;
  encoding: string;
}

/** Parameters shared by most repository-scoped methods. */
interface RepoParams {
  owner: string;
  repo: string;
  branch: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class ReportsGitHubClient {
  private octokit: Octokit;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  /** Factory shorthand. */
  static for(accessToken: string): ReportsGitHubClient {
    return new ReportsGitHubClient(accessToken);
  }

  // -------------------------------------------------------------------------
  // Git Tree API — list all files recursively
  // -------------------------------------------------------------------------

  /**
   * Fetch the full recursive tree for a given branch and filter entries
   * whose paths start with `prefix` and end with `.md`.
   *
   * Returns the raw tree entries (path relative to repo root).
   */
  async listMarkdownFiles(
    params: RepoParams,
    prefix: string,
  ): Promise<TreeEntry[]> {
    const { owner, repo, branch } = params;

    // Resolve branch to its tree SHA
    const refResponse = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const commitSha = refResponse.data.object.sha;

    const commitResponse = await this.octokit.git.getCommit({
      owner,
      repo,
      commit_sha: commitSha,
    });
    const treeSha = commitResponse.data.tree.sha;

    // Fetch the full tree recursively
    const treeResponse = await this.octokit.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "1",
    });

    // Empty prefix means repo root — include all .md blobs
    if (!prefix) {
      return (treeResponse.data.tree as TreeEntry[]).filter(
        (entry) => entry.type === "blob" && entry.path.endsWith(".md"),
      );
    }

    const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

    return (treeResponse.data.tree as TreeEntry[]).filter(
      (entry) =>
        entry.type === "blob" &&
        entry.path.startsWith(normalizedPrefix) &&
        entry.path.endsWith(".md"),
    );
  }

  // -------------------------------------------------------------------------
  // Git Blob API — fetch file content by SHA
  // -------------------------------------------------------------------------

  /**
   * Fetch a blob's content by its SHA and return it decoded as UTF-8 text.
   */
  async getBlobContent(
    owner: string,
    repo: string,
    sha: string,
  ): Promise<string> {
    const response = await this.octokit.git.getBlob({
      owner,
      repo,
      file_sha: sha,
    });

    if (response.data.encoding === "base64") {
      return Buffer.from(response.data.content, "base64").toString("utf-8");
    }

    return response.data.content;
  }

  // -------------------------------------------------------------------------
  // Contents API — single file read/write
  // -------------------------------------------------------------------------

  /**
   * Get a file's content via the Contents API.
   * Returns the decoded UTF-8 content and the file's SHA (needed for updates).
   *
   * Returns `null` if the file does not exist (404).
   */
  async getFileContent(
    params: RepoParams,
    path: string,
  ): Promise<{ content: string; sha: string } | null> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: params.owner,
        repo: params.repo,
        path,
        ref: params.branch,
      });

      const data = response.data;

      // The Contents API returns an array for directories
      if (Array.isArray(data)) {
        return null;
      }

      if (data.type !== "file" || !("content" in data)) {
        return null;
      }

      const content = Buffer.from(data.content as string, "base64").toString(
        "utf-8",
      );

      return { content, sha: data.sha };
    } catch (error: unknown) {
      if (isOctokitError(error) && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create or update a file via the Contents API.
   *
   * If `fileSha` is provided, the file is updated (required by GitHub to
   * prevent accidental overwrites). If omitted, the file is created.
   */
  async putFileContent(
    params: RepoParams,
    path: string,
    content: string,
    message: string,
    fileSha?: string,
  ): Promise<void> {
    const encodedContent = Buffer.from(content, "utf-8").toString("base64");

    await this.octokit.repos.createOrUpdateFileContents({
      owner: params.owner,
      repo: params.repo,
      path,
      message,
      content: encodedContent,
      branch: params.branch,
      ...(fileSha ? { sha: fileSha } : {}),
    });
  }
}

// ---------------------------------------------------------------------------
// OAuth helper
// ---------------------------------------------------------------------------

/**
 * Exchange a GitHub OAuth authorization code for an access token.
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; token_type: string }> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub OAuth failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (data.error) {
    throw new Error(
      `GitHub OAuth error: ${data.error_description || data.error}`,
    );
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type || "Bearer",
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

interface OctokitError {
  status: number;
  message: string;
}

function isOctokitError(error: unknown): error is OctokitError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as OctokitError).status === "number"
  );
}
