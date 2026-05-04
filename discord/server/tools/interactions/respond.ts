import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import * as interactionStore from "../../triggers/interaction-store.ts";
import { fetchInteractionAPI } from "./_fetch.ts";

/**
 * Send the real reply to a Discord interaction the MCP previously auto-deferred.
 *
 * Use this in response to any interaction trigger
 * (discord.interaction.button, .select, .modal_submit, .slash_command).
 *
 * Webhook URL is auth'd by the interaction_token itself — no bot token
 * needed. Token is valid for 15 minutes from when the interaction fired.
 */
export const createInteractionFollowupTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_INTERACTION_FOLLOWUP",
    description:
      "Respond to a deferred Discord interaction. Pass `interaction_token` and `application_id` from the trigger payload. By default, edits the deferred message (replaces the 'thinking' indicator); set is_followup=true to send an additional message instead. Token is valid for 15 minutes after the interaction fired.",
    annotations: { destructiveHint: false },
    inputSchema: z
      .object({
        interaction_token: z
          .string()
          .describe(
            "The interaction_token from the trigger payload. Auths the response.",
          ),
        application_id: z
          .string()
          .describe(
            "The application_id (Discord App ID) from the trigger payload.",
          ),
        content: z
          .string()
          .max(2000)
          .optional()
          .describe("Plain text content of the response."),
        embeds: z
          .array(z.record(z.string(), z.unknown()))
          .optional()
          .describe(
            "Discord embed objects (https://discord.com/developers/docs/resources/message#embed-object).",
          ),
        components: z
          .array(z.record(z.string(), z.unknown()))
          .optional()
          .describe(
            "Discord component rows (action rows of buttons/selects). Pass exactly the JSON shape Discord expects.",
          ),
        ephemeral: z
          .boolean()
          .optional()
          .describe(
            "Only honored when is_followup=true. The deferred message's ephemeral flag is fixed at defer time and cannot be changed.",
          ),
        is_followup: z
          .boolean()
          .default(false)
          .describe(
            "false (default): edit the original deferred message. true: send a new follow-up message.",
          ),
        interaction_id: z
          .string()
          .optional()
          .describe(
            "Optional: pass for idempotency on this pod. If two Mesh connections share the same bot, only the first FOLLOWUP for a given interaction_id will be sent; subsequent calls return already_responded.",
          ),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        message_id: z.string().optional(),
        already_responded: z.boolean().optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const ctx = params.context as {
        interaction_token: string;
        application_id: string;
        content?: string;
        embeds?: Record<string, unknown>[];
        components?: Record<string, unknown>[];
        ephemeral?: boolean;
        is_followup?: boolean;
        interaction_id?: string;
      };

      // Idempotency: if we have the interaction_id, refuse a second response
      // from this pod. Discord would just return 404/400 anyway, but this
      // saves a round-trip and prevents the "two connections answer the same
      // interaction" double-fire on shared bot tokens.
      if (ctx.interaction_id) {
        const ok = interactionStore.markResponded(ctx.interaction_id);
        if (!ok) {
          return {
            success: false,
            message:
              "Already responded to this interaction (deduped against another connection that shares this bot).",
            already_responded: true,
          };
        }
      }

      const url = ctx.is_followup
        ? `https://discord.com/api/v10/webhooks/${encodeURIComponent(ctx.application_id)}/${encodeURIComponent(ctx.interaction_token)}`
        : `https://discord.com/api/v10/webhooks/${encodeURIComponent(ctx.application_id)}/${encodeURIComponent(ctx.interaction_token)}/messages/@original`;
      const method = ctx.is_followup ? "POST" : "PATCH";

      const body: Record<string, unknown> = {};
      if (ctx.content !== undefined) body.content = ctx.content;
      if (ctx.embeds !== undefined) body.embeds = ctx.embeds;
      if (ctx.components !== undefined) body.components = ctx.components;
      if (ctx.is_followup && ctx.ephemeral) body.flags = 64;

      const result = await fetchInteractionAPI(url, method, body);
      if (!result.success) {
        return { success: false, message: result.message };
      }
      return {
        success: true,
        message: ctx.is_followup
          ? "Follow-up sent."
          : "Original deferred message updated.",
        message_id: result.message_id,
      };
    },
  });
