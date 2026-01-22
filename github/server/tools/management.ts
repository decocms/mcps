/**
 * GitHub Management Tools
 *
 * Tools for listing repositories and webhooks.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { GitHubClient } from "../lib/github-client.ts";
import type { Env } from "../types/env.ts";

/**
 * Get the GitHub access token from the environment
 */
function getGitHubToken(env: Env): string {
  const token = env.MESH_REQUEST_CONTEXT?.authorization;
  if (!token) {
    throw new Error(
      "GitHub authorization token not found. Please authenticate first.",
    );
  }
  return token;
}

/**
 * Tool to list repositories accessible to the GitHub App installation
 */
export const createListRepositoriesTool = (env: Env) =>
  createTool({
    id: "list_repositories",
    description:
      "List all repositories accessible to the GitHub App installation. " +
      "Returns repository names, descriptions, and visibility settings.",
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of repositories to return"),
    }),
    outputSchema: z.object({
      repositories: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          full_name: z.string(),
          private: z.boolean(),
          description: z.string().nullable(),
          default_branch: z.string(),
          html_url: z.string(),
        }),
      ),
      total: z.number(),
    }),
    execute: async ({ context }) => {
      const token = getGitHubToken(env);
      const client = GitHubClient.for(token);

      const repositories = await client.listRepositories();
      const limited = repositories.slice(0, context.limit);

      return {
        repositories: limited.map((repo) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          description: repo.description,
          default_branch: repo.default_branch,
          html_url: repo.html_url,
        })),
        total: repositories.length,
      };
    },
  });

/**
 * Tool to list webhooks for a specific repository
 */
export const createListWebhooksTool = (env: Env) =>
  createTool({
    id: "list_webhooks",
    description:
      "List webhooks for a specific repository. Shows webhook URLs, events, and status.",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner (username or organization)"),
      repo: z.string().describe("Repository name"),
    }),
    outputSchema: z.object({
      webhooks: z.array(
        z.object({
          id: z.number(),
          url: z.string(),
          events: z.array(z.string()),
          active: z.boolean(),
        }),
      ),
      total: z.number(),
    }),
    execute: async ({ context }) => {
      const token = getGitHubToken(env);
      const client = GitHubClient.for(token);

      const webhooks = await client.listWebhooks(context.owner, context.repo);

      return {
        webhooks: webhooks.map((wh) => ({
          id: wh.id,
          url: wh.config.url || "",
          events: wh.events,
          active: wh.active,
        })),
        total: webhooks.length,
      };
    },
  });
