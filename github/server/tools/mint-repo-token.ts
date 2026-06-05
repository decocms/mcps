/**
 * MINT_REPO_TOKEN — mint a GitHub App installation access token scoped to
 * exactly one repository, with least-privilege permissions.
 *
 * Used by Deco Studio to give an imported agent a token that can touch ONLY
 * its own repo (baked into the sandbox clone URL). Tokens are short-lived
 * (~1h) with no refresh token — Studio calls this again to refresh.
 *
 * `createPrivateTool` ensures the request is authenticated before executing;
 * the heavy lifting (caller authorization, permission capping, minting) lives
 * in `../lib/repo-token.ts`. Env (and thus the caller's GitHub token) is read
 * from `runtimeContext.env` at execution time — on Workers there is no env at
 * tool-build time.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { mintRepoScopedToken } from "../lib/repo-token.ts";
import type { Env } from "../types/env.ts";

export function createMintRepoTokenTool() {
  return createPrivateTool({
    id: "MINT_REPO_TOKEN",
    description:
      "Mint a short-lived (~1h) GitHub token scoped to exactly ONE repository " +
      "with least-privilege permissions, using the GitHub App. The authenticated " +
      "caller must already be entitled to the installation and repository — the " +
      "tool verifies this against the caller's own GitHub context before minting. " +
      "The token grants only repo-content / pull-request / issue access. Tokens " +
      "are not cached and have no refresh token; call again to refresh.",
    inputSchema: z.object({
      installationId: z
        .number()
        .int()
        .describe("GitHub App installation id to mint the token under."),
      owner: z
        .string()
        .describe(
          'The installation account login, e.g. "acme" (NOT "owner/repo").',
        ),
      repo: z
        .string()
        .describe('The repository NAME only, e.g. "web" (NOT "acme/web").'),
      permissions: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Optional GitHub permission map, capped to least privilege. Allowed " +
            "keys: contents, metadata, pull_requests, issues; values: read | " +
            'write. Defaults to { contents: "write", metadata: "read", ' +
            'pull_requests: "write" }. Anything broader is rejected.',
        ),
    }),
    outputSchema: z.object({
      token: z
        .string()
        .describe("The ghs_ repository-scoped installation token."),
      expiresAt: z
        .string()
        .describe("ISO8601 expiry (~1h from now; issued by GitHub)."),
      permissions: z
        .record(z.string(), z.string())
        .describe("The permissions actually granted, echoed from GitHub."),
      repository: z.object({
        owner: z.string(),
        name: z.string(),
      }),
      installationId: z.number(),
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as unknown as Env;
      const callerToken = env.MESH_REQUEST_CONTEXT?.authorization ?? "";

      return await mintRepoScopedToken({
        callerToken,
        installationId: context.installationId,
        owner: context.owner,
        repo: context.repo,
        permissions: context.permissions,
      });
    },
  });
}
