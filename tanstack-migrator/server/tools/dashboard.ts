/** Dashboard entry tool — opens the MCP App UI with an aggregate snapshot. */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { DASHBOARD_RESOURCE_URI } from "../constants.ts";
import { listSites } from "../db/sites.ts";
import { ACTIVE_STATUSES } from "../db/types.ts";
import { ensureApiKeyFromRequest } from "../lib/ensure-api-key.ts";
import { parseMigratorConfig, type Env } from "../types/env.ts";
import { SiteViewSchema, toSiteView } from "./views.ts";

export const createDashboardTool = (env: Env) =>
  createTool({
    id: "TANSTACK_MIGRATOR_DASHBOARD",
    description:
      "Open the TanStack Migrator dashboard: migration queue with parity %, sites that are 100% TanStack, repos and reports.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      sites: z.array(SiteViewSchema),
      queue: z.object({
        active: z.number(),
        queued: z.number(),
        needsHuman: z.number(),
        done: z.number(),
        maxConcurrent: z.number(),
        provider: z.string(),
      }),
      updatedAt: z.string(),
    }),
    _meta: { ui: { resourceUri: DASHBOARD_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      if (!connectionId) {
        throw new Error(
          "Sem contexto de conexão do mesh (connectionId ausente). Chame este MCP através de uma conexão do studio — e se a conexão foi criada com um access token preenchido, limpe o campo Token e salve.",
        );
      }
      void ensureApiKeyFromRequest(env); // fire-and-forget, throttled

      const config = parseMigratorConfig(
        env.MESH_REQUEST_CONTEXT?.state as Record<string, unknown> | undefined,
      );
      const all = await listSites({ connectionId });
      const visible = all.filter((s) => s.status !== "archived");

      return {
        sites: visible.map(toSiteView),
        queue: {
          active: visible.filter((s) =>
            (ACTIVE_STATUSES as string[]).includes(s.status),
          ).length,
          queued: visible.filter(
            (s) => s.status === "queued" || s.status === "draft",
          ).length,
          needsHuman: visible.filter((s) => s.status === "needs_human").length,
          done: visible.filter((s) => s.status === "done").length,
          maxConcurrent: config.maxConcurrent,
          provider: config.sandboxProvider,
        },
        updatedAt: new Date().toISOString(),
      };
    },
  });
