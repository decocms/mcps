/**
 * Scope the current user token to a single repository.
 *
 * Called from Studio after the user picks a repo during import. The
 * connection keeps the original refresh token; subsequent refreshes pass
 * repository_id from connection metadata via the mesh OAuth proxy.
 */

import { createTool, type AppContext } from "@decocms/runtime/tools";
import { z } from "zod";
import { scopeUserAccessTokenToRepository } from "../lib/github-client.ts";
import type { Env } from "../types/env.ts";

function getOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GITHUB_CLIENT_ID || "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "GitHub OAuth credentials not configured. " +
        "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.",
    );
  }
  return { clientId, clientSecret };
}

export const GITHUB_SCOPE_TOKEN = createTool({
  id: "GITHUB_SCOPE_TOKEN",
  description:
    "Restrict the authenticated GitHub user token to a single repository.",
  inputSchema: z.object({
    repository_id: z
      .number()
      .int()
      .positive()
      .describe("GitHub repository ID to scope the token to"),
    target: z
      .string()
      .min(1)
      .describe(
        "GitHub user or organization login that owns the repository (owner login)",
      ),
  }),
  execute: async ({ context }, ctx) => {
    const env = (ctx as unknown as AppContext<Env>).env;
    const accessToken = env.MESH_REQUEST_CONTEXT?.authorization;
    if (!accessToken) {
      throw new Error("GitHub authorization token not found");
    }

    const { clientId, clientSecret } = getOAuthCredentials();
    const scoped = await scopeUserAccessTokenToRepository(
      accessToken,
      clientId,
      clientSecret,
      {
        repositoryId: context.repository_id,
        target: context.target,
      },
    );

    return {
      access_token: scoped.token,
      token_type: "Bearer",
      expires_in: scoped.expires_in,
      repository_id: context.repository_id,
    };
  },
});
