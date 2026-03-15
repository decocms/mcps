import type { Env } from "../types/env.ts";
import { runSQL } from "../db/postgres.ts";
import { classifyConversation } from "../lib/ai.ts";

interface SlackEvent {
  type: string;
  data: {
    channel?: string;
    channel_id?: string;
    user?: string;
    username?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    files?: Array<{ name: string }>;
  };
  source?: string;
  subject?: string;
}

export async function processSlackEvent(
  event: SlackEvent,
  env: Env,
): Promise<void> {
  const data = event.data;
  const channelId = data.channel_id || data.channel;
  if (!channelId || !data.text || !data.ts) return;

  // Check if this channel is a monitored source
  const sources = await runSQL<{
    id: string;
    connection_id: string;
  }>(
    env,
    "SELECT id, connection_id FROM inbox_source WHERE source_type = ? AND external_channel_id = ? AND enabled = true",
    ["slack", channelId],
  );

  if (sources.length === 0) return;
  const source = sources[0];

  const threadId = data.thread_ts || data.ts;

  // Find or create conversation
  const existing = await runSQL<{ id: string; message_count: number }>(
    env,
    "SELECT id, message_count FROM inbox_conversation WHERE source_id = ? AND external_thread_id = ?",
    [source.id, threadId],
  );

  let conversationId: string;

  if (existing.length > 0) {
    conversationId = existing[0].id;
    await runSQL(
      env,
      "UPDATE inbox_conversation SET last_message_at = NOW(), message_count = ?, updated_at = NOW() WHERE id = ?",
      [existing[0].message_count + 1, conversationId],
    );
  } else {
    conversationId = crypto.randomUUID();
    const preview =
      data.text.length > 100 ? `${data.text.slice(0, 100)}...` : data.text;
    await runSQL(
      env,
      `INSERT INTO inbox_conversation (id, source_id, source_type, external_thread_id, subject, customer_name, customer_id, last_message_at, message_count)
       VALUES (?, ?, 'slack', ?, ?, ?, ?, NOW(), 1)`,
      [
        conversationId,
        source.id,
        threadId,
        preview,
        data.username || data.user || "Unknown",
        data.user || "",
      ],
    );
  }

  // Insert message
  const messageId = crypto.randomUUID();
  const hasAttachments = (data.files?.length ?? 0) > 0;

  await runSQL(
    env,
    `INSERT INTO inbox_message (id, conversation_id, external_message_id, source_type, direction, sender_name, sender_id, content, has_attachments, metadata)
     VALUES (?, ?, ?, 'slack', 'inbound', ?, ?, ?, ?, ?)`,
    [
      messageId,
      conversationId,
      data.ts,
      data.username || data.user || "Unknown",
      data.user || "",
      data.text,
      hasAttachments,
      JSON.stringify({ channel: channelId, thread_ts: data.thread_ts }),
    ],
  );

  console.log(
    `[SLACK] Ingested message ${data.ts} into conversation ${conversationId}`,
  );

  // Auto-classify new conversations (fire and forget)
  if (existing.length === 0) {
    classifyConversation(
      env,
      data.text,
      data.username || data.user || "Unknown",
    )
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
