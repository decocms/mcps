/**
 * get_apps_script_config tool
 *
 * Returns everything a user needs to wire up the Google Apps Script notifier
 * for THIS connection: the webhook URL (with the connectionId baked in), the
 * per-connection HMAC token, and a ready-to-paste config block for the
 * `apps-script/calendar-notifier.gs` template.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { computeWebhookToken } from "../webhook.ts";
import { WEBHOOK_BASE_URL, DEFAULT_LEAD_MINUTES } from "../constants.ts";

interface MinimalEnv {
  MESH_REQUEST_CONTEXT?: { connectionId?: string };
}

export const createGetAppsScriptConfigTool = (env: MinimalEnv) =>
  createPrivateTool({
    id: "get_apps_script_config",
    description:
      "Get the configuration to set up the Google Apps Script that notifies " +
      "you before upcoming meetings (and on event changes). Returns the webhook " +
      "URL, the auth token for this connection, and a config snippet to paste " +
      "into the calendar-notifier.gs template. Each user runs the script in " +
      "their own Google account; it polls their calendar and posts events here.",
    inputSchema: z.object({
      leadMinutes: z.coerce
        .number()
        .int()
        .min(1)
        .max(120)
        .optional()
        .describe(
          `Minutes before an event to notify (default: ${DEFAULT_LEAD_MINUTES}). Lives in the Apps Script.`,
        ),
    }),
    outputSchema: z.object({
      webhookUrl: z.string().describe("URL the Apps Script posts events to"),
      webhookToken: z
        .string()
        .describe("Bearer token for this connection (paste into the script)"),
      leadMinutes: z.number().describe("Configured lead time in minutes"),
      snippet: z
        .string()
        .describe("Config block to paste at the top of calendar-notifier.gs"),
      instructions: z.string().describe("Setup steps"),
    }),
    execute: async ({ context }) => {
      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      if (!connectionId) {
        throw new Error(
          "No connectionId in request context — open this from a configured connection.",
        );
      }

      const webhookToken = await computeWebhookToken(connectionId);
      const webhookUrl = `${WEBHOOK_BASE_URL}/calendar/events/${connectionId}`;
      const leadMinutes = context.leadMinutes ?? DEFAULT_LEAD_MINUTES;

      const snippet = [
        `const WEBHOOK_URL = ${JSON.stringify(webhookUrl)};`,
        `const WEBHOOK_TOKEN = ${JSON.stringify(webhookToken)};`,
        `const LEAD_MINUTES = ${leadMinutes};`,
        `const POLL_WINDOW_MIN = ${leadMinutes + 5};`,
        `const CALENDAR_ID = "primary";`,
      ].join("\n");

      const instructions = [
        "1. Open https://script.google.com and create a new project.",
        "2. Paste the contents of calendar-notifier.gs.",
        "3. Replace the config block at the top with the `snippet` below.",
        "4. Run the `setup` function once and authorize the script.",
        "5. The time-driven trigger (every 5 min) will notify you before events;",
        "   the onEventUpdated trigger will report created/updated/deleted events.",
        "Before configuring the script, configure the trigger(s) in the studio",
        "(TRIGGER_CONFIGURE) so this connection has a delivery callback.",
      ].join("\n");

      return { webhookUrl, webhookToken, leadMinutes, snippet, instructions };
    },
  });
