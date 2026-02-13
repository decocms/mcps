/**
 * Configuration helpers
 *
 * Extracts and validates GitHub repo configuration from the MCP environment.
 */

import type { Env } from "../types/env.ts";
import { ReportsGitHubClient } from "./github-client.ts";

export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

/**
 * Extract validated repo configuration from the environment state.
 * Throws if required fields are missing or malformed.
 */
export function getRepoConfig(env: Env): RepoConfig {
  const state = env.MESH_REQUEST_CONTEXT?.state;

  const repoStr = state?.REPO;
  if (!repoStr || typeof repoStr !== "string") {
    throw new Error(
      'REPO configuration is required. Set it to "owner/repo" format.',
    );
  }

  const parts = repoStr.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid REPO format: "${repoStr}". Expected "owner/repo" (e.g., "acme/my-reports").`,
    );
  }

  return {
    owner: parts[0],
    repo: parts[1],
    branch: (state?.BRANCH as string) || "reports",
    path: (state?.PATH as string) || "reports",
  };
}

/** Status file path within the reports directory. */
export const STATUS_FILE_NAME = ".reports-status.json";

/**
 * Build the full path to the lifecycle status file.
 */
export function getStatusFilePath(reportsPath: string): string {
  return `${reportsPath}/${STATUS_FILE_NAME}`;
}

/**
 * Create a ReportsGitHubClient from the environment's OAuth token.
 */
export function getGitHubClient(env: Env): ReportsGitHubClient {
  const token = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!token) {
    throw new Error(
      "GitHub authentication required. Please connect your GitHub account.",
    );
  }
  return ReportsGitHubClient.for(token);
}
