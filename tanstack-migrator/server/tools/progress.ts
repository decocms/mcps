/**
 * Progress callback for the decopilot sessions driving a migration: the
 * prompt instructs the agent to call this after each relevant step, which
 * feeds the dashboard (phase detail, live parity score) and resets the
 * watchdog clock.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { addEvent } from "../db/events.ts";
import { getSite, updateSite } from "../db/sites.ts";
import type { SiteRow } from "../db/types.ts";
import type { Env } from "../types/env.ts";

export const createReportProgressTool = (_env: Env) =>
  createPrivateTool({
    id: "MIGRATION_REPORT_PROGRESS",
    description:
      "Report migration progress for a site (called by the migration agent after each step). Updates the dashboard and resets the stall watchdog.",
    inputSchema: z.object({
      siteId: z.string(),
      detail: z.string().optional().describe("What was just done"),
      parityScore: z.number().min(0).max(100).optional(),
      iteration: z.number().int().optional(),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
    execute: async ({ context }) => {
      const site = await getSite(context.siteId);
      if (!site) throw new Error("Site not found");

      const patch: Partial<SiteRow> = {
        last_progress_at: new Date().toISOString(),
      };
      if (context.detail) patch.phase_detail = context.detail.slice(0, 500);
      if (context.parityScore !== undefined) {
        patch.parity_score = context.parityScore;
      }
      await updateSite(site.id, patch);

      if (context.detail) {
        await addEvent(site.id, `[agente] ${context.detail.slice(0, 500)}`);
      }
      return { ok: true };
    },
  });
