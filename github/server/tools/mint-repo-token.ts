/**
 * MINT_REPO_TOKEN — mint a GitHub App installation access token scoped to
 * exactly one repository, AND issue a durable synthetic refresh token (an
 * MCP-issued repo grant — NOT a GitHub refresh token).
 *
 * The short-lived (~1h) `ghs_` token is unchanged. The refresh token is the
 * opaque `ghr_<grantId>.<secret>` string; redeeming it at `tokenEndpoint`
 * re-mints a fresh `ghs_` token using only the GitHub App credentials.
 *
 * `createPrivateTool` ensures the caller is authenticated; caller authorization,
 * permission capping, minting and grant issuance live in ../lib/*.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  mintRepoTokenWithGrant,
  repoGrantBaseUrl,
  repoGrantClientId,
} from "../lib/repo-grant.ts";
import { getRepoGrantStore } from "../lib/repo-grant-store.ts";
import type { Env } from "../types/env.ts";

export function createMintRepoTokenTool() {
  return createPrivateTool({
    id: "MINT_REPO_TOKEN",
    description:
      "Mint a short-lived (~1h) GitHub token scoped to exactly ONE repository " +
      "with least-privilege permissions, using the GitHub App. The authenticated " +
      "caller must already be entitled to the installation and repository — the " +
      "tool verifies this against the caller's own GitHub context before minting. " +
      "The token grants only repo-content / pull-request / issue access. Also " +
      "returns a durable refresh token (refreshToken) plus tokenEndpoint and " +
      "clientId: POST grant_type=refresh_token to tokenEndpoint to mint a fresh " +
      "token later without the caller's GitHub login.",
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
      repositoryId: z
        .number()
        .int()
        .optional()
        .describe(
          "Optional numeric repository id. When provided it is cross-checked " +
            "against the repo the caller is entitled to; the resolved id is " +
            "authoritative (rename-proof).",
        ),
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
      expiresIn: z
        .number()
        .optional()
        .describe("Seconds until the access token expires (usually <= 3600)."),
      tokenType: z.literal("Bearer").optional(),
      permissions: z
        .record(z.string(), z.string())
        .describe("The permissions actually granted, echoed from GitHub."),
      repository: z.object({
        id: z.number().optional(),
        owner: z.string(),
        name: z.string(),
      }),
      installationId: z.number(),
      refreshToken: z
        .string()
        .describe(
          "Opaque MCP-issued repo grant (ghr_...). NOT a GitHub token.",
        ),
      tokenEndpoint: z
        .string()
        .describe("Absolute HTTPS endpoint accepting a refresh_token grant."),
      clientId: z
        .string()
        .describe("Stable client id expected by tokenEndpoint."),
      refreshTokenExpiresAt: z
        .string()
        .nullable()
        .optional()
        .describe("ISO8601 expiry of the refresh grant (sliding 90 days)."),
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as unknown as Env;
      const callerToken = env.MESH_REQUEST_CONTEXT?.authorization ?? "";

      return await mintRepoTokenWithGrant({
        callerToken,
        installationId: context.installationId,
        owner: context.owner,
        repo: context.repo,
        repositoryId: context.repositoryId,
        permissions: context.permissions,
        clientId: repoGrantClientId(env),
        baseUrl: repoGrantBaseUrl(env),
        store: getRepoGrantStore(),
        createdByConnectionId: env.MESH_REQUEST_CONTEXT?.connectionId,
      });
    },
  });
}
