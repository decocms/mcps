/** Standalone, deterministic installer for the .deco sync-mirror workflow. */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadConnection } from "../db/connections.ts";
import { getSite } from "../db/sites.ts";
import { parseRepo } from "../lib/github.ts";
import { buildWorkerCtx } from "../lib/mesh.ts";
import { installSyncWorkflow } from "../lib/sync-install.ts";
import { SYNC_WORKFLOW_PATH } from "../sandbox/templates/sync-files.ts";
import type { Env } from "../types/env.ts";

function normalizeRepo(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
}

export const createSyncDecofileInstallTool = (env: Env) =>
  createTool({
    id: "SYNC_DECOFILE_INSTALL",
    description:
      "Open a PR on a CLIENT production repo that adds the .deco sync-mirror workflow (.github/workflows/sync-deco-content.yml). On every push of CMS content to the client's main, it mirrors .deco/blocks into the -tanstack repo. Adds EXACTLY this one file — never touches anything else (safe for production repos). Idempotent (reuses an open PR). Pass a siteId to default repo=client source repo + target=-tanstack, or pass repo + targetRepo explicitly. NOTE: after merging, a human must add the token secret (default STOREFRONT_SYNC_TOKEN) with write access to the target repo.",
    inputSchema: z.object({
      siteId: z
        .string()
        .optional()
        .describe(
          "Migration site id — defaults repo to its source (client) repo and targetRepo to its -tanstack repo.",
        ),
      repo: z
        .string()
        .optional()
        .describe(
          'Client production repo "owner/name" (where the workflow is installed).',
        ),
      targetRepo: z
        .string()
        .optional()
        .describe(
          'The -tanstack repo "owner/name" the workflow mirrors .deco/blocks into.',
        ),
      base: z
        .string()
        .optional()
        .describe("Client repo base branch for the PR (default main)."),
      tokenSecret: z
        .string()
        .optional()
        .describe(
          "Repo-secret name holding the target-repo write token (default STOREFRONT_SYNC_TOKEN).",
        ),
    }),
    outputSchema: z.object({
      installed: z.boolean(),
      repo: z.string(),
      targetRepo: z.string(),
      path: z.string(),
      prNumber: z.number().nullable(),
      prUrl: z.string().nullable(),
      tokenSecret: z.string(),
      reason: z.string(),
    }),
    execute: async ({ context }) => {
      const site = context.siteId ? await getSite(context.siteId) : null;
      if (context.siteId && !site) throw new Error("Site not found");

      const clientRepo = normalizeRepo(context.repo ?? site?.source_repo ?? "");
      const targetRepo = normalizeRepo(
        context.targetRepo ?? site?.target_repo ?? "",
      );
      if (!clientRepo)
        throw new Error("repo is required (pass repo or a siteId)");
      if (!targetRepo) {
        throw new Error(
          "targetRepo is required (pass targetRepo or a siteId with a -tanstack repo)",
        );
      }

      // GitHub mutations must run under the right tenant — prefer the site's
      // connection, fall back to the current request's connection.
      const connectionId =
        site?.connection_id ?? env.MESH_REQUEST_CONTEXT?.connectionId;
      if (!connectionId) {
        throw new Error(
          "No connection context — call through a studio connection or pass a siteId.",
        );
      }
      const row = await loadConnection(connectionId);
      if (!row) throw new Error(`Connection ${connectionId} not found`);
      const ctx = buildWorkerCtx(row);

      const result = await installSyncWorkflow(ctx, parseRepo(clientRepo), {
        sourceRepo: clientRepo,
        targetRepo,
        base: context.base,
        tokenSecret: context.tokenSecret,
      });
      return {
        installed: result.installed,
        repo: clientRepo,
        targetRepo,
        path: SYNC_WORKFLOW_PATH,
        prNumber: result.prNumber,
        prUrl: result.prUrl,
        tokenSecret: result.tokenSecret,
        reason: result.reason,
      };
    },
  });
