import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import {
  loadConnectionConfig,
  updateAlertConfig,
} from "../lib/supabase-client.ts";
import type { Env } from "../types/env.ts";

export const createSetAlertTool = (env: Env) =>
  createTool({
    id: "GATEWAY_SET_ALERT",
    description:
      "Configures a low-balance email alert for this organization's AI Gateway. " +
      "When the remaining credit drops below the configured USD threshold, " +
      "an email notification is sent. The alert fires once per limit cycle and resets " +
      "automatically when the user adds more credit.",
    inputSchema: z
      .object({
        enabled: z
          .boolean()
          .describe("Whether to enable or disable the low-balance alert."),
        threshold_usd: z
          .number()
          .positive()
          .max(10_000)
          .optional()
          .describe(
            "Alert when remaining credit falls to this USD value. Defaults to $10.",
          ),
        email: z
          .string()
          .email()
          .optional()
          .describe(
            "Email address to receive the alert. Required when enabling.",
          ),
      })
      .strict(),
    outputSchema: z
      .object({
        summary: z.string(),
        enabled: z.boolean(),
        threshold_usd: z.number(),
        email: z.string().nullable(),
        connectionId: z.string(),
      })
      .strict(),
    execute: async ({ context }) => {
      const { enabled, threshold_usd, email } = context;

      const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
      if (!connectionId) {
        throw new Error("connectionId not found in context.");
      }

      const row = await loadConnectionConfig(connectionId);
      if (!row) {
        throw new Error(
          "No connection configured. Make an LLM call first to trigger setup.",
        );
      }

      const resolvedEmail = email ?? row.alert_email;
      const resolvedThreshold = threshold_usd ?? row.alert_threshold_usd ?? 10;

      if (enabled && !resolvedEmail) {
        throw new Error(
          "An email address is required to enable alerts. Provide the 'email' parameter.",
        );
      }

      await updateAlertConfig(connectionId, {
        alertEnabled: enabled,
        alertThresholdUsd: resolvedThreshold,
        alertEmail: resolvedEmail ?? row.alert_email,
      });

      const summary = enabled
        ? `Low-balance alert enabled. An email will be sent to ${resolvedEmail} when credit drops below $${resolvedThreshold.toFixed(2)}.`
        : "Low-balance alert disabled.";

      return {
        summary,
        enabled,
        threshold_usd: resolvedThreshold,
        email: enabled ? resolvedEmail : row.alert_email,
        connectionId,
      };
    },
  });

export const alertTools = [createSetAlertTool];
