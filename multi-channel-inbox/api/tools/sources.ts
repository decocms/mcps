import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { runSQL } from "../db/postgres.ts";
import type { Env } from "../types/env.ts";

export const addSourceTool = (env: Env) =>
  createTool({
    id: "inbox_add_source",
    description:
      "Add a Slack channel, Discord channel, or Gmail label to monitor for support messages.",
    inputSchema: z
      .object({
        source_type: z
          .enum(["slack", "discord", "gmail"])
          .describe("The type of source to monitor"),
        connection_id: z
          .string()
          .describe(
            "The Mesh connection ID of the source MCP (Slack, Discord, or Gmail)",
          ),
        external_channel_id: z
          .string()
          .optional()
          .describe("Channel ID for Slack or Discord (not needed for Gmail)"),
        external_channel_name: z
          .string()
          .optional()
          .describe("Human-readable channel name"),
        gmail_label: z
          .string()
          .optional()
          .describe("Gmail label to monitor (e.g., 'support')"),
        gmail_query: z
          .string()
          .optional()
          .describe("Gmail search query (e.g., 'to:support@company.com')"),
      })
      .superRefine((data, ctx) => {
        if (
          (data.source_type === "slack" || data.source_type === "discord") &&
          !data.external_channel_id
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "external_channel_id is required for slack and discord sources",
            path: ["external_channel_id"],
          });
        }
        if (
          data.source_type === "gmail" &&
          !data.gmail_label &&
          !data.gmail_query
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Either gmail_label or gmail_query is required for gmail sources",
            path: ["gmail_label"],
          });
        }
      }),
    outputSchema: z.object({
      id: z.string(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const id = crypto.randomUUID();
      await runSQL(
        env,
        `INSERT INTO inbox_source (id, source_type, connection_id, external_channel_id, external_channel_name, gmail_label, gmail_query)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          context.source_type,
          context.connection_id,
          context.external_channel_id || null,
          context.external_channel_name || null,
          context.gmail_label || null,
          context.gmail_query || null,
        ],
      );
      return {
        id,
        message: `Source added: ${context.source_type} ${context.external_channel_name || context.gmail_label || context.gmail_query || ""}`,
      };
    },
  });

export const listSourcesTool = (env: Env) =>
  createTool({
    id: "inbox_list_sources",
    description:
      "List all configured inbox sources (channels and labels being monitored).",
    inputSchema: z.object({}),
    outputSchema: z.object({
      sources: z.array(
        z.object({
          id: z.string(),
          source_type: z.string(),
          connection_id: z.string(),
          external_channel_id: z.string().nullable(),
          external_channel_name: z.string().nullable(),
          gmail_label: z.string().nullable(),
          gmail_query: z.string().nullable(),
          enabled: z.boolean(),
        }),
      ),
    }),
    annotations: { readOnlyHint: true },
    execute: async ({}) => {
      const sources = await runSQL<{
        id: string;
        source_type: string;
        connection_id: string;
        external_channel_id: string | null;
        external_channel_name: string | null;
        gmail_label: string | null;
        gmail_query: string | null;
        enabled: boolean;
      }>(
        env,
        "SELECT id, source_type, connection_id, external_channel_id, external_channel_name, gmail_label, gmail_query, enabled FROM inbox_source ORDER BY created_at DESC",
        [],
      );
      return { sources };
    },
  });

export const removeSourceTool = (env: Env) =>
  createTool({
    id: "inbox_remove_source",
    description:
      "Disable a monitored source from the inbox. The source is soft-deleted (marked as disabled) and will no longer be polled.",
    inputSchema: z.object({
      id: z.string().describe("The source ID to disable"),
    }),
    outputSchema: z.object({ message: z.string() }),
    execute: async ({ context }) => {
      await runSQL(
        env,
        "UPDATE inbox_source SET enabled = false, updated_at = NOW() WHERE id = ?",
        [context.id],
      );
      return { message: `Source ${context.id} disabled` };
    },
  });
