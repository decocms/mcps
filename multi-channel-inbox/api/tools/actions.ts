import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { runSQL } from "../db/postgres.ts";
import { callMeshTool } from "../ingestion/mesh-client.ts";
import type { Env } from "../types/env.ts";

export const replyTool = (env: Env) =>
  createTool({
    id: "inbox_reply",
    description:
      "Reply to a conversation via the original platform (Slack, Discord, or Gmail).",
    inputSchema: z.object({
      conversation_id: z.string().describe("The conversation to reply to"),
      message: z.string().describe("The reply message content"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      // Get conversation and source info
      const conversations = await runSQL<{
        id: string;
        source_id: string;
        source_type: string;
        external_thread_id: string;
        customer_id: string;
      }>(
        env,
        "SELECT c.id, c.source_id, c.source_type, c.external_thread_id, c.customer_id FROM inbox_conversation c WHERE c.id = ?",
        [context.conversation_id],
      );

      if (conversations.length === 0) {
        throw new Error(`Conversation ${context.conversation_id} not found`);
      }

      const conv = conversations[0];

      const sources = await runSQL<{
        connection_id: string;
        external_channel_id: string;
      }>(
        env,
        "SELECT connection_id, external_channel_id FROM inbox_source WHERE id = ?",
        [conv.source_id],
      );

      if (sources.length === 0) {
        throw new Error(`Source ${conv.source_id} not found`);
      }

      const source = sources[0];

      // Send reply via the original platform
      switch (conv.source_type) {
        case "slack": {
          await callMeshTool(
            env,
            source.connection_id,
            "SLACK_REPLY_IN_THREAD",
            {
              channel: source.external_channel_id,
              thread_ts: conv.external_thread_id,
              text: context.message,
            },
          );
          break;
        }
        case "discord": {
          await callMeshTool(
            env,
            source.connection_id,
            "DISCORD_SEND_MESSAGE",
            {
              channelId: source.external_channel_id,
              content: context.message,
              replyToMessageId: conv.external_thread_id,
            },
          );
          break;
        }
        case "gmail": {
          // Get the last message to reply to
          const lastMessages = await runSQL<{
            external_message_id: string;
            metadata: string;
          }>(
            env,
            "SELECT external_message_id, metadata FROM inbox_message WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
            [context.conversation_id],
          );

          const metadata = lastMessages[0]?.metadata
            ? JSON.parse(lastMessages[0].metadata as string)
            : {};

          await callMeshTool(env, source.connection_id, "gmail_send_message", {
            to: conv.customer_id,
            subject: `Re: ${metadata.subject || ""}`,
            body: context.message,
            threadId: conv.external_thread_id,
          });
          break;
        }
        default:
          throw new Error(`Unknown source type: ${conv.source_type}`);
      }

      // Record outbound message
      const messageId = crypto.randomUUID();
      await runSQL(
        env,
        `INSERT INTO inbox_message (id, conversation_id, external_message_id, source_type, direction, sender_name, sender_id, content)
         VALUES (?, ?, ?, ?, 'outbound', 'Support Agent', 'system', ?)`,
        [
          messageId,
          context.conversation_id,
          `reply-${messageId}`,
          conv.source_type,
          context.message,
        ],
      );

      // Update conversation
      await runSQL(
        env,
        "UPDATE inbox_conversation SET status = 'in_progress', message_count = message_count + 1, last_message_at = NOW(), updated_at = NOW() WHERE id = ?",
        [context.conversation_id],
      );

      return {
        success: true,
        message: `Reply sent via ${conv.source_type}`,
      };
    },
  });
