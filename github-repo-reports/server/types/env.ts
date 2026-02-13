/**
 * Environment Type Definitions for GitHub Repo Reports MCP
 *
 * Defines the StateSchema for user configuration and the Env type
 * used throughout the MCP server.
 */

import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

/**
 * State Schema - Configuration form for the MCP
 *
 * Users fill this form when installing the MCP in Mesh.
 * Configures which GitHub repository and branch to read reports from.
 */
export const StateSchema = z.object({
  /**
   * Target repository in "owner/repo" format.
   * The GitHub App must have access to this repository.
   */
  REPO: z
    .string()
    .describe(
      'Target repository in "owner/repo" format (e.g., "acme/my-reports")',
    ),

  /**
   * Path to the reports directory within the repository.
   * Reports are stored as Markdown files with YAML frontmatter
   * under this directory. Subdirectories become tags.
   */
  PATH: z
    .string()
    .default("reports")
    .describe("Path to the reports directory in the repository"),

  /**
   * Git branch to read reports from.
   * Defaults to "reports" — a dedicated branch for report storage.
   */
  BRANCH: z
    .string()
    .default("reports")
    .describe("Git branch to read reports from"),
});

/**
 * Environment type combining runtime context with our StateSchema.
 */
export type Env = DefaultEnv<typeof StateSchema>;
