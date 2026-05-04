import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";
import * as interactionStore from "../../triggers/interaction-store.ts";
import { fetchInteractionAPI } from "./_fetch.ts";

/**
 * Replace the message that contained the component the user just interacted
 * with. Most common use case: disable the button after click.
 *
 * Only valid for component interactions (button/select). After auto-defer
 * with deferUpdate(), this tool effectively unsets the deferral and
 * replaces the message in one shot via PATCH /messages/@original.
 */
export const createInteractionUpdateTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_INTERACTION_UPDATE",
    description:
      "Update the message that contained the button/select the user just clicked (replace content, embeds, or components). Use this to disable a button after click or swap select-menu options. Pass the new components array — typically the original buttons with `disabled: true`. Only valid for button/select interactions. Token is valid for 15 minutes.",
    annotations: { destructiveHint: false },
    inputSchema: z
      .object({
        interaction_token: z.string(),
        application_id: z.string(),
        content: z
          .string()
          .max(2000)
          .nullable()
          .optional()
          .describe(
            "New content. Pass null to clear, omit to leave unchanged (Discord behavior).",
          ),
        embeds: z
          .array(z.record(z.string(), z.unknown()))
          .nullable()
          .optional()
          .describe("New embeds. Pass [] or null to clear."),
        components: z
          .array(z.record(z.string(), z.unknown()))
          .nullable()
          .optional()
          .describe(
            "New components. Pass [] or null to remove all components.",
          ),
        interaction_id: z
          .string()
          .optional()
          .describe(
            "Optional: idempotency key against same-bot multi-connection fan-out.",
          ),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        already_responded: z.boolean().optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const ctx = params.context as {
        interaction_token: string;
        application_id: string;
        content?: string | null;
        embeds?: Record<string, unknown>[] | null;
        components?: Record<string, unknown>[] | null;
        interaction_id?: string;
      };

      if (ctx.interaction_id) {
        const ok = interactionStore.markResponded(ctx.interaction_id);
        if (!ok) {
          return {
            success: false,
            message: "Already responded to this interaction.",
            already_responded: true,
          };
        }
      }

      const url = `https://discord.com/api/v10/webhooks/${encodeURIComponent(ctx.application_id)}/${encodeURIComponent(ctx.interaction_token)}/messages/@original`;

      const body: Record<string, unknown> = {};
      if (ctx.content !== undefined) body.content = ctx.content;
      if (ctx.embeds !== undefined) body.embeds = ctx.embeds;
      if (ctx.components !== undefined) body.components = ctx.components;

      const result = await fetchInteractionAPI(url, "PATCH", body);
      if (!result.success) {
        return { success: false, message: result.message };
      }
      return { success: true, message: "Original message updated." };
    },
  });
