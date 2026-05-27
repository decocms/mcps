import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { listSnapshots } from "../lib/client.ts";
import { getApiKey, getAppKey } from "../lib/env.ts";
import type { Env } from "../types/env.ts";

const snapshotTrafficSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  visits: z.number(),
  clicks: z.number(),
  clickThroughRate: z
    .number()
    .describe("clicks / visits, or 0 when visits === 0"),
});

const inputSchema = z.object({});

const outputSchema = z.object({
  totalVisits: z.number(),
  totalClicks: z.number(),
  overallCTR: z.number(),
  bySnapshot: z.array(snapshotTrafficSchema),
});

export const getTrafficTool = (_env: Env) =>
  createTool({
    id: "crazy_egg_get_traffic",
    description:
      "⚠️ Derived from the undocumented v2 snapshots endpoint. Aggregate traffic metrics across all snapshots: total visits, total clicks, and per-snapshot click-through rate. Useful as a lightweight web-analytics summary.",
    inputSchema,
    outputSchema,

    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async ({ runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const apiKey = getApiKey(env);
      const appKey = getAppKey(env);

      const snapshots = await listSnapshots({ apiKey, appKey });

      let totalVisits = 0;
      let totalClicks = 0;
      const bySnapshot = snapshots.map((s) => {
        const visits = typeof s.total_visits === "number" ? s.total_visits : 0;
        const clicks = typeof s.total_clicks === "number" ? s.total_clicks : 0;
        totalVisits += visits;
        totalClicks += clicks;
        const clickThroughRate = visits > 0 ? clicks / visits : 0;
        return {
          id: String(s.id),
          name: s.name,
          visits,
          clicks,
          clickThroughRate,
        };
      });

      const overallCTR = totalVisits > 0 ? totalClicks / totalVisits : 0;

      return { totalVisits, totalClicks, overallCTR, bySnapshot };
    },
  });
