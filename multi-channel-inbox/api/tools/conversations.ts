import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { runSQL } from "../db/postgres.ts";
import type { Env } from "../types/env.ts";

const conversationSchema = z.object({
  id: z.string(),
  source_id: z.string(),
  source_type: z.string(),
  external_thread_id: z.string().nullable(),
  subject: z.string().nullable(),
  status: z.string(),
  priority: z.string().nullable(),
  category: z.string().nullable(),
  assignee: z.string().nullable(),
  customer_name: z.string().nullable(),
  customer_id: z.string().nullable(),
  last_message_at: z.string().nullable(),
  message_count: z.number(),
  ai_summary: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  created_at: z.string(),
});

const messageSchema = z.object({
  id: z.string(),
  external_message_id: z.string(),
  source_type: z.string(),
  direction: z.string(),
  sender_name: z.string().nullable(),
  sender_id: z.string().nullable(),
  content: z.string(),
  content_html: z.string().nullable(),
  has_attachments: z.boolean(),
  created_at: z.string(),
});

export const INBOX_RESOURCE_URI = "ui://multi-channel-inbox/inbox";

export const listConversationsTool = (env: Env) =>
  createTool({
    id: "inbox_list_conversations",
    description:
      "List inbox conversations with filters for status, priority, source type, and search.",
    inputSchema: z.object({
      status: z
        .enum(["open", "in_progress", "resolved", "archived"])
        .optional()
        .describe("Filter by status"),
      priority: z
        .enum(["low", "normal", "high", "urgent"])
        .optional()
        .describe("Filter by priority"),
      source_type: z
        .enum(["slack", "discord", "gmail"])
        .optional()
        .describe("Filter by source type"),
      search: z
        .string()
        .optional()
        .describe("Search in subject and customer name"),
      limit: z.number().optional().describe("Max results (default 50)"),
      offset: z.number().optional().describe("Offset for pagination"),
    }),
    outputSchema: z.object({
      conversations: z.array(conversationSchema),
      total: z.number(),
    }),
    _meta: { ui: { resourceUri: INBOX_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ context }) => {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (context.status) {
        conditions.push("status = ?");
        params.push(context.status);
      }
      if (context.priority) {
        conditions.push("priority = ?");
        params.push(context.priority);
      }
      if (context.source_type) {
        conditions.push("source_type = ?");
        params.push(context.source_type);
      }
      if (context.search) {
        conditions.push("(subject ILIKE ? OR customer_name ILIKE ?)");
        params.push(`%${context.search}%`, `%${context.search}%`);
      }

      const where =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = context.limit || 50;
      const offset = context.offset || 0;

      const conversations = await runSQL<z.infer<typeof conversationSchema>>(
        env,
        `SELECT id, source_id, source_type, external_thread_id, subject, status, priority, category, assignee, customer_name, customer_id, last_message_at, message_count, ai_summary, tags, created_at
         FROM inbox_conversation ${where}
         ORDER BY last_message_at DESC NULLS LAST
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      const countResult = await runSQL<{ count: number }>(
        env,
        `SELECT COUNT(*) as count FROM inbox_conversation ${where}`,
        params,
      );

      return {
        conversations,
        total: countResult[0]?.count ?? 0,
      };
    },
  });

export const getConversationTool = (env: Env) =>
  createTool({
    id: "inbox_get_conversation",
    description: "Get a conversation with all its messages.",
    inputSchema: z.object({
      id: z.string().describe("Conversation ID"),
    }),
    outputSchema: z.object({
      conversation: conversationSchema,
      messages: z.array(messageSchema),
    }),
    _meta: { ui: { resourceUri: INBOX_RESOURCE_URI } },
    annotations: { readOnlyHint: true },
    execute: async ({ context }) => {
      const conversations = await runSQL<z.infer<typeof conversationSchema>>(
        env,
        "SELECT id, source_id, source_type, external_thread_id, subject, status, priority, category, assignee, customer_name, customer_id, last_message_at, message_count, ai_summary, tags, created_at FROM inbox_conversation WHERE id = ?",
        [context.id],
      );

      if (conversations.length === 0) {
        throw new Error(`Conversation ${context.id} not found`);
      }

      const messages = await runSQL<z.infer<typeof messageSchema>>(
        env,
        "SELECT id, external_message_id, source_type, direction, sender_name, sender_id, content, content_html, has_attachments, created_at FROM inbox_message WHERE conversation_id = ? ORDER BY created_at ASC",
        [context.id],
      );

      return {
        conversation: conversations[0],
        messages,
      };
    },
  });

export const updateConversationTool = (env: Env) =>
  createTool({
    id: "inbox_update_conversation",
    description: "Update a conversation's status, priority, assignee, or tags.",
    inputSchema: z.object({
      id: z.string().describe("Conversation ID"),
      status: z
        .enum(["open", "in_progress", "resolved", "archived"])
        .optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      assignee: z.string().optional(),
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
    }),
    outputSchema: z.object({ message: z.string() }),
    execute: async ({ context }) => {
      const updates: string[] = [];
      const params: unknown[] = [];

      if (context.status) {
        updates.push("status = ?");
        params.push(context.status);
      }
      if (context.priority) {
        updates.push("priority = ?");
        params.push(context.priority);
      }
      if (context.assignee !== undefined) {
        updates.push("assignee = ?");
        params.push(context.assignee);
      }
      if (context.tags) {
        updates.push("tags = ?");
        params.push(context.tags);
      }
      if (context.category !== undefined) {
        updates.push("category = ?");
        params.push(context.category);
      }

      if (updates.length === 0) {
        return { message: "Nothing to update" };
      }

      updates.push("updated_at = NOW()");
      params.push(context.id);

      await runSQL(
        env,
        `UPDATE inbox_conversation SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );

      return { message: `Conversation ${context.id} updated` };
    },
  });

export const archiveConversationsTool = (env: Env) =>
  createTool({
    id: "inbox_archive",
    description: "Batch archive resolved conversations.",
    inputSchema: z.object({
      ids: z
        .array(z.string())
        .optional()
        .describe(
          "Specific conversation IDs to archive. If empty, archives all resolved.",
        ),
    }),
    outputSchema: z.object({
      archived_count: z.number(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      let result: { count: number }[];
      if (context.ids && context.ids.length > 0) {
        const placeholders = context.ids.map(() => "?").join(", ");
        result = await runSQL<{ count: number }>(
          env,
          `UPDATE inbox_conversation SET status = 'archived', updated_at = NOW() WHERE id IN (${placeholders}) RETURNING 1 as count`,
          context.ids,
        );
      } else {
        result = await runSQL<{ count: number }>(
          env,
          "UPDATE inbox_conversation SET status = 'archived', updated_at = NOW() WHERE status = 'resolved' RETURNING 1 as count",
          [],
        );
      }
      const count = result.length;
      return {
        archived_count: count,
        message: `Archived ${count} conversations`,
      };
    },
  });

export const statsTool = (env: Env) =>
  createTool({
    id: "inbox_stats",
    description:
      "Get inbox dashboard stats: counts by source, status, priority.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      by_status: z.array(z.object({ status: z.string(), count: z.number() })),
      by_source: z.array(
        z.object({ source_type: z.string(), count: z.number() }),
      ),
      by_priority: z.array(
        z.object({ priority: z.string(), count: z.number() }),
      ),
      total_open: z.number(),
      total_conversations: z.number(),
    }),
    annotations: { readOnlyHint: true },
    execute: async () => {
      const byStatus = await runSQL<{
        status: string;
        count: number;
      }>(
        env,
        "SELECT status, COUNT(*) as count FROM inbox_conversation GROUP BY status",
        [],
      );

      const bySource = await runSQL<{
        source_type: string;
        count: number;
      }>(
        env,
        "SELECT source_type, COUNT(*) as count FROM inbox_conversation WHERE status != 'archived' GROUP BY source_type",
        [],
      );

      const byPriority = await runSQL<{
        priority: string;
        count: number;
      }>(
        env,
        "SELECT priority, COUNT(*) as count FROM inbox_conversation WHERE status != 'archived' AND priority IS NOT NULL GROUP BY priority",
        [],
      );

      const totalOpen = byStatus.find((s) => s.status === "open")?.count ?? 0;
      const totalConversations = byStatus.reduce(
        (sum, s) => sum + Number(s.count),
        0,
      );

      return {
        by_status: byStatus,
        by_source: bySource,
        by_priority: byPriority,
        total_open: totalOpen,
        total_conversations: totalConversations,
      };
    },
  });
