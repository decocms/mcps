import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import { fetchInteractionAPI } from "./_fetch.ts";

/**
 * Show a modal as the response to an interaction.
 *
 * IMPORTANT CAVEAT: modals can ONLY be the FIRST response to an interaction.
 * If the MCP already auto-deferred (default for ALL interactions), this call
 * will fail. To use modals reliably, set StateSchema.AUTO_DEFER_MODE = "off"
 * for this connection. Then your agent has 3s to call SHOW_MODAL after
 * receiving an interaction trigger.
 *
 * Modals are best driven by no-defer slash commands: register the command
 * externally via Discord Developer Portal, and configure your agent to
 * react to discord.interaction.slash_command and call SHOW_MODAL.
 */
export const createInteractionShowModalTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_INTERACTION_SHOW_MODAL",
    description:
      "Show a Discord modal in response to an interaction. Pass interaction_id + interaction_token from the trigger payload. CAVEAT: only works if the MCP did not auto-defer this interaction. Set AUTO_DEFER_MODE='off' on the connection to use modals; your agent then has 3s to respond. Best used with externally-registered slash commands.",
    annotations: { destructiveHint: false },
    inputSchema: z
      .object({
        interaction_id: z
          .string()
          .describe("interaction_id from the trigger payload."),
        interaction_token: z
          .string()
          .describe("interaction_token from the trigger payload."),
        custom_id: z
          .string()
          .max(100)
          .describe(
            "Custom ID for the modal — appears in the discord.interaction.modal_submit trigger payload when the user submits.",
          ),
        title: z.string().max(45).describe("Modal title shown in the dialog."),
        components: z
          .array(z.record(z.string(), z.unknown()))
          .min(1)
          .max(5)
          .describe(
            "Action rows containing text input components (component type 4). Each row holds one text input. Up to 5 rows. See https://discord.com/developers/docs/interactions/message-components#text-inputs.",
          ),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
      })
      .strict(),
    execute: async (params: any) => {
      const ctx = params.context as {
        interaction_id: string;
        interaction_token: string;
        custom_id: string;
        title: string;
        components: Record<string, unknown>[];
      };

      const url = `https://discord.com/api/v10/interactions/${encodeURIComponent(ctx.interaction_id)}/${encodeURIComponent(ctx.interaction_token)}/callback`;

      const body = {
        type: 9, // MODAL response type
        data: {
          custom_id: ctx.custom_id,
          title: ctx.title,
          components: ctx.components,
        },
      };

      const result = await fetchInteractionAPI(url, "POST", body);
      if (!result.success) {
        // 400 INTERACTION_ALREADY_ACKNOWLEDGED is the most common failure —
        // the MCP auto-deferred. Surface a hint instead of the raw API error.
        const text = result.response_text ?? "";
        if (text.includes("acknowledged") || text.includes("40060")) {
          return {
            success: false,
            message:
              "Interaction already acknowledged — modals can only be the FIRST response. Set AUTO_DEFER_MODE='off' on this connection to enable modals, or trigger the modal from a slash command (registered externally) where the agent can respond within 3 seconds.",
          };
        }
        return { success: false, message: result.message };
      }
      return { success: true, message: "Modal shown." };
    },
  });
