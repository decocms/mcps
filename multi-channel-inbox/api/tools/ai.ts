import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { runSQL } from "../db/postgres.ts";
import {
  classifyConversation,
  suggestReply,
  summarizeConversation,
} from "../lib/ai.ts";
import type { Env } from "../types/env.ts";

export const classifyTool = (env: Env) =>
  createTool({
    id: "inbox_classify",
    description:
      "AI-classify a conversation's category and priority based on its messages. Requires MODEL_PROVIDER to be configured.",
    inputSchema: z.object({
      conversation_id: z.string().describe("The conversation to classify"),
    }),
    outputSchema: z.object({
      category: z.string().nullable(),
      priority: z.string().nullable(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const messages = await runSQL<{
        content: string;
        sender_name: string;
      }>(
        env,
        "SELECT content, sender_name FROM inbox_message WHERE conversation_id = ? AND direction = 'inbound' ORDER BY created_at ASC LIMIT 5",
        [context.conversation_id],
      );

      if (messages.length === 0) {
        return {
          category: null,
          priority: null,
          message: "No inbound messages to classify",
        };
      }

      const combined = messages.map((m) => m.content).join("\n");
      const customerName = messages[0].sender_name || "Unknown";

      const result = await classifyConversation(env, combined, customerName);

      if (!result) {
        return {
          category: null,
          priority: null,
          message:
            "AI classification not available. Configure MODEL_PROVIDER and LANGUAGE_MODEL.",
        };
      }

      // Update conversation
      await runSQL(
        env,
        "UPDATE inbox_conversation SET category = ?, priority = ?, updated_at = NOW() WHERE id = ?",
        [result.category, result.priority, context.conversation_id],
      );

      return {
        category: result.category,
        priority: result.priority,
        message: `Classified as ${result.category} (${result.priority} priority)`,
      };
    },
  });

export const summarizeTool = (env: Env) =>
  createTool({
    id: "inbox_summarize",
    description:
      "AI-summarize a conversation. Requires MODEL_PROVIDER to be configured.",
    inputSchema: z.object({
      conversation_id: z.string().describe("The conversation to summarize"),
    }),
    outputSchema: z.object({
      summary: z.string().nullable(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const messages = await runSQL<{
        sender_name: string;
        content: string;
        direction: string;
      }>(
        env,
        "SELECT sender_name, content, direction FROM inbox_message WHERE conversation_id = ? ORDER BY created_at ASC",
        [context.conversation_id],
      );

      if (messages.length === 0) {
        return {
          summary: null,
          message: "No messages to summarize",
        };
      }

      const summary = await summarizeConversation(env, messages);

      if (!summary) {
        return {
          summary: null,
          message:
            "AI summarization not available. Configure MODEL_PROVIDER and LANGUAGE_MODEL.",
        };
      }

      // Save summary
      await runSQL(
        env,
        "UPDATE inbox_conversation SET ai_summary = ?, updated_at = NOW() WHERE id = ?",
        [summary, context.conversation_id],
      );

      return { summary, message: "Summary generated" };
    },
  });

export const suggestReplyTool = (env: Env) =>
  createTool({
    id: "inbox_suggest_reply",
    description:
      "AI-suggest a reply for a conversation. Requires MODEL_PROVIDER to be configured.",
    inputSchema: z.object({
      conversation_id: z
        .string()
        .describe("The conversation to suggest a reply for"),
    }),
    outputSchema: z.object({
      suggested_reply: z.string().nullable(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      // Get conversation category
      const conversations = await runSQL<{ category: string | null }>(
        env,
        "SELECT category FROM inbox_conversation WHERE id = ?",
        [context.conversation_id],
      );

      const category = conversations[0]?.category ?? null;

      // Get messages
      const messages = await runSQL<{
        sender_name: string;
        content: string;
        direction: string;
      }>(
        env,
        "SELECT sender_name, content, direction FROM inbox_message WHERE conversation_id = ? ORDER BY created_at ASC",
        [context.conversation_id],
      );

      if (messages.length === 0) {
        return {
          suggested_reply: null,
          message: "No messages to base reply on",
        };
      }

      const reply = await suggestReply(env, messages, category);

      if (!reply) {
        return {
          suggested_reply: null,
          message:
            "AI reply suggestion not available. Configure MODEL_PROVIDER and LANGUAGE_MODEL.",
        };
      }

      return { suggested_reply: reply, message: "Reply suggested" };
    },
  });
