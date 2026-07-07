/** Dashboard discovery tools. */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { grafanaFetch } from "../lib/client.ts";
import type { Env } from "../types/env.ts";

export const createSearchDashboardsTool = (env: Env) =>
  createTool({
    id: "GRAFANA_SEARCH_DASHBOARDS",
    description:
      "Search Grafana dashboards by title. Returns uid + title + url for each match. Use the uid with GRAFANA_GET_DASHBOARD.",
    inputSchema: z.object({
      query: z.string().default("").describe("Title substring to search for."),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    outputSchema: z.object({
      dashboards: z.array(
        z.object({
          uid: z.string(),
          title: z.string(),
          url: z.string().nullable(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const rows = await grafanaFetch<
        Array<{ uid: string; title: string; url?: string }>
      >(
        env,
        `/api/search?type=dash-db&limit=${context.limit}&query=${encodeURIComponent(context.query)}`,
      );
      return {
        dashboards: (rows ?? []).map((d) => ({
          uid: d.uid,
          title: d.title,
          url: d.url ?? null,
        })),
      };
    },
  });

export const createGetDashboardTool = (env: Env) =>
  createTool({
    id: "GRAFANA_GET_DASHBOARD",
    description:
      "Get a dashboard's full JSON by uid (panels, targets/queries, variables). Useful to read the exact datasource + query a panel uses.",
    inputSchema: z.object({ uid: z.string() }),
    outputSchema: z.object({ dashboard: z.record(z.string(), z.unknown()) }),
    execute: async ({ context }) => {
      const body = await grafanaFetch<{ dashboard?: Record<string, unknown> }>(
        env,
        `/api/dashboards/uid/${encodeURIComponent(context.uid)}`,
      );
      return { dashboard: body?.dashboard ?? {} };
    },
  });
