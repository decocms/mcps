/**
 * Home widgets (deco CMS home / "What's on your mind" screen).
 * Same MCP-App pattern as the dashboard tool, but small cards that follow the
 * user's theme: WIDGET_ACTIVE (the site migrating right now) + WIDGET_QUEUE
 * (the queue list + counters). Both read the same site rows as the dashboard.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  WIDGET_ACTIVE_RESOURCE_URI,
  WIDGET_QUEUE_RESOURCE_URI,
} from "../constants.ts";
import { listSites } from "../db/sites.ts";
import { ACTIVE_STATUSES } from "../db/types.ts";
import { ensureApiKeyFromRequest } from "../lib/ensure-api-key.ts";
import { type Env, parseMigratorConfig } from "../types/env.ts";
import { SiteViewSchema, toSiteView } from "./views.ts";

function requireConnectionId(env: Env): string {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) {
    throw new Error(
      "Sem contexto de conexão do mesh (connectionId ausente). Chame este MCP através de uma conexão do studio.",
    );
  }
  return connectionId;
}

const isActive = (status: string) =>
  (ACTIVE_STATUSES as string[]).includes(status);

/** Widget A — the site migrating right now (most recently updated active one). */
export const createActiveWidgetTool = (env: Env) =>
  createTool({
    id: "TANSTACK_MIGRATOR_WIDGET_ACTIVE",
    description:
      "Home widget: the storefront being migrated right now (phase, parity %, issues, cost).",
    inputSchema: z.object({}),
    outputSchema: z.object({
      site: SiteViewSchema.nullable(),
      updatedAt: z.string(),
    }),
    _meta: { ui: { resourceUri: WIDGET_ACTIVE_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const connectionId = requireConnectionId(env);
      void ensureApiKeyFromRequest(env);
      const all = await listSites({ connectionId });
      const visible = all.filter((s) => s.status !== "archived");
      // most recently touched active site, else latest done, else latest any
      const active = visible
        .filter((s) => isActive(s.status))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      const done = visible
        .filter((s) => s.status === "done")
        .sort((a, b) =>
          (b.finished_at ?? b.updated_at).localeCompare(
            a.finished_at ?? a.updated_at,
          ),
        );
      const picked = active[0] ?? done[0] ?? null;
      return {
        site: picked ? toSiteView(picked) : null,
        updatedAt: new Date().toISOString(),
      };
    },
  });

/** Widget B — the migration queue: compact list + counters. */
export const createQueueWidgetTool = (env: Env) =>
  createTool({
    id: "TANSTACK_MIGRATOR_WIDGET_QUEUE",
    description:
      "Home widget: migration queue list with per-site status/parity and totals (migrating/queued/done/needs-human).",
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
    _meta: { ui: { resourceUri: WIDGET_QUEUE_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const connectionId = requireConnectionId(env);
      void ensureApiKeyFromRequest(env);
      const config = parseMigratorConfig(
        env.MESH_REQUEST_CONTEXT?.state as Record<string, unknown> | undefined,
      );
      const all = await listSites({ connectionId });
      const visible = all.filter((s) => s.status !== "archived");
      // widget list = everything not done/failed first (active + queued),
      // sorted active-first then by created; cap for a compact card
      const inFlight = visible
        .filter((s) => isActive(s.status) || s.status === "queued")
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      return {
        sites: inFlight.slice(0, 20).map(toSiteView),
        queue: {
          active: visible.filter((s) => isActive(s.status)).length,
          queued: visible.filter((s) => s.status === "queued").length,
          needsHuman: visible.filter((s) => s.status === "needs_human").length,
          done: visible.filter((s) => s.status === "done").length,
          maxConcurrent: config.maxConcurrent,
          provider: config.sandboxProvider,
        },
        updatedAt: new Date().toISOString(),
      };
    },
  });
