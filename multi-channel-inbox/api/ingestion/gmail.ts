import type { Env } from "../types/env.ts";
import { runSQL } from "../db/postgres.ts";
import { callMeshTool, parseJsonFromResult } from "./mesh-client.ts";

interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  body?: string;
  bodyText?: string;
  hasAttachments?: boolean;
  labelIds?: string[];
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startGmailPolling(env: Env): void {
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  const intervalMinutes =
    env.MESH_REQUEST_CONTEXT?.state?.GMAIL_POLL_INTERVAL_MINUTES ?? 3;
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[GMAIL] Starting polling every ${intervalMinutes} minutes`);

  // Run immediately on start
  pollAllGmailSources(env).catch((err) =>
    console.error("[GMAIL] Initial poll error:", err),
  );

  pollInterval = setInterval(() => {
    pollAllGmailSources(env).catch((err) =>
      console.error("[GMAIL] Poll error:", err),
    );
  }, intervalMs);
}

export function stopGmailPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log("[GMAIL] Polling stopped");
  }
}

async function pollAllGmailSources(env: Env): Promise<void> {
  const sources = await runSQL<{
    id: string;
    connection_id: string;
    gmail_label: string | null;
    gmail_query: string | null;
  }>(
    env,
    "SELECT id, connection_id, gmail_label, gmail_query FROM inbox_source WHERE source_type = 'gmail' AND enabled = true",
    [],
  );

  for (const source of sources) {
    try {
      await pollGmailSource(env, source);
    } catch (err) {
      console.error(`[GMAIL] Error polling source ${source.id}:`, err);
    }
  }
}

async function pollGmailSource(
  env: Env,
  source: {
    id: string;
    connection_id: string;
    gmail_label: string | null;
    gmail_query: string | null;
  },
): Promise<void> {
  // Get last poll state
  const syncStates = await runSQL<{
    last_history_id: string | null;
    last_poll_at: string | null;
  }>(
    env,
    "SELECT last_history_id, last_poll_at FROM inbox_gmail_sync_state WHERE source_id = ?",
    [source.id],
  );

  const query =
    source.gmail_query ||
    (source.gmail_label ? `label:${source.gmail_label}` : "in:inbox");
  const sinceQuery = syncStates[0]?.last_poll_at
    ? `${query} after:${new Date(syncStates[0].last_poll_at).toISOString().split("T")[0]}`
    : `${query} newer_than:1d`;

  // Search for messages
  const searchResult = await callMeshTool(
    env,
    source.connection_id,
    "gmail_search_messages",
    { q: sinceQuery, maxResults: 50 },
  );

  let messages: GmailMessage[];
  try {
    messages = parseJsonFromResult<{ messages: GmailMessage[] }>(
      searchResult,
    ).messages;
  } catch {
    console.log(`[GMAIL] No new messages for source ${source.id}`);
    return;
  }

  if (!messages || messages.length === 0) return;

  for (const msg of messages) {
    // Check if already ingested
    const existing = await runSQL(
      env,
      "SELECT id FROM inbox_message WHERE external_message_id = ? AND source_type = 'gmail'",
      [msg.id],
    );
    if (existing.length > 0) continue;

    // Get full message if needed
    let fullMsg = msg;
    if (!msg.body && !msg.bodyText) {
      try {
        const detailResult = await callMeshTool(
          env,
          source.connection_id,
          "gmail_get_message",
          { messageId: msg.id },
        );
        fullMsg = parseJsonFromResult<GmailMessage>(detailResult);
      } catch {
        // Use what we have
      }
    }

    await ingestGmailMessage(env, source.id, fullMsg);
  }

  // Update sync state
  await runSQL(
    env,
    `INSERT INTO inbox_gmail_sync_state (source_id, last_poll_at)
     VALUES (?, NOW())
     ON CONFLICT (source_id) DO UPDATE SET last_poll_at = NOW()`,
    [source.id],
  );

  console.log(
    `[GMAIL] Polled ${messages.length} messages for source ${source.id}`,
  );
}

async function ingestGmailMessage(
  env: Env,
  sourceId: string,
  msg: GmailMessage,
): Promise<void> {
  const threadId = msg.threadId;
  const content = msg.bodyText || msg.body || msg.snippet || "";
  const senderName = msg.from || "Unknown";

  // Find or create conversation by Gmail threadId
  const existing = await runSQL<{ id: string; message_count: number }>(
    env,
    "SELECT id, message_count FROM inbox_conversation WHERE source_id = ? AND external_thread_id = ?",
    [sourceId, threadId],
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
    await runSQL(
      env,
      `INSERT INTO inbox_conversation (id, source_id, source_type, external_thread_id, subject, customer_name, customer_id, last_message_at, message_count)
       VALUES (?, ?, 'gmail', ?, ?, ?, ?, NOW(), 1)`,
      [
        conversationId,
        sourceId,
        threadId,
        msg.subject || content.slice(0, 100),
        senderName,
        msg.from || "",
      ],
    );
  }

  // Insert message
  const messageId = crypto.randomUUID();
  await runSQL(
    env,
    `INSERT INTO inbox_message (id, conversation_id, external_message_id, source_type, direction, sender_name, sender_id, content, content_html, has_attachments, metadata)
     VALUES (?, ?, ?, 'gmail', 'inbound', ?, ?, ?, ?, ?, ?)`,
    [
      messageId,
      conversationId,
      msg.id,
      senderName,
      msg.from || "",
      msg.bodyText || msg.snippet || "",
      msg.body || null,
      msg.hasAttachments ?? false,
      JSON.stringify({
        threadId: msg.threadId,
        subject: msg.subject,
        to: msg.to,
        date: msg.date,
        labelIds: msg.labelIds,
      }),
    ],
  );
}
