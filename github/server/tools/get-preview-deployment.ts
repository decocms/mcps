/**
 * GET_PREVIEW_DEPLOYMENT — resolve a commit's preview URL from its GitHub
 * Deployments.
 *
 * Some hosts (VTEX FastStore WebOps in particular) publish a PR's preview URL
 * only as a GitHub Deployment's `deployment_status.environment_url` — not as a
 * commit-status `target_url` and not as a bot comment. The upstream
 * `pull_request_read` has no deployments method, so the PR panel can't surface
 * those previews. This first-party tool fills the gap by reading the REST
 * Deployments API with the caller's own token.
 *
 * `createPrivateTool` ensures the caller is authenticated; the read is scoped by
 * the caller's token (needs deployments:read).
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { getPreviewDeployment } from "../lib/deployment.ts";
import type { Env } from "../types/env.ts";

export function createGetPreviewDeploymentTool() {
  return createPrivateTool({
    id: "GET_PREVIEW_DEPLOYMENT",
    description:
      "Resolve a commit's preview URL from its GitHub Deployments — the newest " +
      "successful deployment status's environment_url. Fills a gap in " +
      "pull_request_read (no deployments method) for hosts like VTEX FastStore " +
      "that publish the preview as a deployment rather than a status target_url " +
      "or a bot comment. Returns environmentUrl: null when the commit has no " +
      "deployment with a published url yet (e.g. an in-flight deploy). Requires " +
      "deployments:read on the caller's token.",
    inputSchema: z.object({
      owner: z
        .string()
        .describe('Repository owner/login, e.g. "acme" (NOT "owner/repo").'),
      repo: z
        .string()
        .describe('The repository NAME only, e.g. "web" (NOT "acme/web").'),
      sha: z
        .string()
        .describe(
          "The commit sha to resolve (7–40 hex chars), typically the PR head sha.",
        ),
      environment: z
        .string()
        .optional()
        .describe(
          'Optional environment filter, e.g. "staging". Omit to match any.',
        ),
    }),
    outputSchema: z.object({
      environmentUrl: z.string().nullable(),
      environment: z.string().nullable(),
      state: z.string().nullable(),
      deploymentId: z.number().nullable(),
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as unknown as Env;
      const token = env.MESH_REQUEST_CONTEXT?.authorization ?? "";
      return await getPreviewDeployment({
        token,
        owner: context.owner,
        repo: context.repo,
        sha: context.sha,
        environment: context.environment,
      });
    },
  });
}
