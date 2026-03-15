import type { Env } from "../types/env.ts";
import { runSQL } from "../db/postgres.ts";
import { classifyConversation } from "../lib/ai.ts";

interface DiscordEvent {
  type: string;
  data: {
    channel_id?: string;
    guild_id?: string;
    author_id?: string;
    author_username?: string;
    content?: string;
    message_id?: string;
    referenced_message_id?: string;
    attachments?: Array<{ filename: string }>;
  };
  source?: string;
}

export async function processDiscordEvent(
  event: DiscordEvent,
  env: Env,
): Promise<void> {
  const data = event.data;
  const channelId = data.channel_id;
  if (!channelId || !data.content || !data.message_id) return;

  // Check if this channel is a monitored source
  const sources = await runSQL<{
    id: string;
    connection_id: string;
  }>(
    env,
    "SELECT id, connection_id FROM inbox_source WHERE source_type = ? AND external_channel_id = ? AND enabled = true",
    ["discord", channelId],
  );

  if (sources.length === 0) return;
  const source = sources[0];

  // For Discord, group by referenced_message_id or treat each message as part of a channel conversation
  const threadId = data.referenced_message_id || data.message_id;

  // Try to find existing conversation by referenced message
  let conversationId: string | null = null;

  if (data.referenced_message_id) {
    const existing = await runSQL<{ id: string; message_count: number }>(
      env,
      "SELECT c.id, c.message_count FROM inbox_conversation c JOIN inbox_message m ON m.conversation_id = c.id WHERE c.source_id = ? AND m.external_message_id = ?",
      [source.id, data.referenced_message_id],
    );
    if (existing.length > 0) {
      conversationId = existing[0].id;
      await runSQL(
        env,
        "UPDATE inbox_conversation SET last_message_at = NOW(), message_count = ?, updated_at = NOW() WHERE id = ?",
        [existing[0].message_count + 1, conversationId],
      );
    }
  }

  if (!conversationId) {
    conversationId = crypto.randomUUID();
    const preview =
      data.content.length > 100
        ? `${data.content.slice(0, 100)}...`
        : data.content;
    await runSQL(
      env,
      `INSERT INTO inbox_conversation (id, source_id, source_type, external_thread_id, subject, customer_name, customer_id, last_message_at, message_count)
       VALUES (?, ?, 'discord', ?, ?, ?, ?, NOW(), 1)`,
      [
        conversationId,
        source.id,
        threadId,
        preview,
        data.author_username || "Unknown",
        data.author_id || "",
      ],
    );
  }

  // Insert message
  const messageId = crypto.randomUUID();
  const hasAttachments = (data.attachments?.length ?? 0) > 0;

  await runSQL(
    env,
    `INSERT INTO inbox_message (id, conversation_id, external_message_id, source_type, direction, sender_name, sender_id, content, has_attachments, metadata)
     VALUES (?, ?, ?, 'discord', 'inbound', ?, ?, ?, ?, ?)`,
    [
      messageId,
      conversationId,
      data.message_id,
      data.author_username || "Unknown",
      data.author_id || "",
      data.content,
      hasAttachments,
      JSON.stringify({
        channel_id: channelId,
        guild_id: data.guild_id,
        referenced_message_id: data.referenced_message_id,
      }),
    ],
  );

  console.log(
    `[DISCORD] Ingested message ${data.message_id} into conversation ${conversationId}`,
  );

  // Auto-classify new conversations (fire and forget)
  if (!data.referenced_message_id) {
    classifyConversation(env, data.content, data.author_username || "Unknown")
      .then((result) => {
        if (result) {
          runSQL(
            env,
            "UPDATE inbox_conversation SET category = ?, priority = ?, updated_at = NOW() WHERE id = ?",
            [result.category, result.priority, conversationId],
          ).catch(() => {});
        }
      })
      .catch(() => {});
  }
}
