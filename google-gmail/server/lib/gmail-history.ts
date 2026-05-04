/**
 * Thin wrappers over Gmail's history.list + messages.get for use from
 * webhook/cron contexts. We only care about INBOX `messageAdded` events
 * for the MVP "email received" trigger.
 */

import { ENDPOINTS } from "../constants.ts";

export interface MessageMetadata {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  internalDate?: string;
}

interface RawMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

interface HistoryListResponse {
  history?: Array<{
    id: string;
    messagesAdded?: Array<{
      message: { id: string; threadId: string; labelIds?: string[] };
    }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
}

/**
 * List messageAdded events scoped to INBOX since the given startHistoryId.
 * Returns the message ids (with thread ids) plus the latest historyId
 * observed across pages. Callers should persist the latest historyId
 * after they finish processing.
 *
 * Returns null on hard failure (e.g. 404 — startHistoryId too old, the
 * mailbox has rotated past it; caller should resync via `users.profile`).
 */
export async function listInboxMessagesAdded(
  accessToken: string,
  startHistoryId: string,
): Promise<{
  messages: Array<{ id: string; threadId: string }>;
  latestHistoryId: string | undefined;
} | null> {
  const seen = new Set<string>();
  const messages: Array<{ id: string; threadId: string }> = [];
  let latestHistoryId: string | undefined;
  let pageToken: string | undefined;

  do {
    const url = new URL(ENDPOINTS.HISTORY);
    url.searchParams.set("startHistoryId", startHistoryId);
    url.searchParams.set("historyTypes", "messageAdded");
    url.searchParams.set("labelId", "INBOX");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 404) {
      // startHistoryId is too old — Gmail only retains ~7 days of history.
      // Caller needs to resync.
      console.warn(
        `[GmailHistory] startHistoryId=${startHistoryId} is stale (404)`,
      );
      return null;
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`[GmailHistory] list failed: ${res.status} - ${text}`);
      return null;
    }

    const data = (await res.json()) as HistoryListResponse;
    if (data.historyId) latestHistoryId = data.historyId;

    for (const entry of data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        const m = added.message;
        // Only keep entries that landed in INBOX. The labelId filter on
        // the request narrows by the *change*, but the message itself
        // may have been removed from INBOX by a later history entry —
        // we'll re-check via labelIds when we fetch metadata.
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        messages.push({ id: m.id, threadId: m.threadId });
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return { messages, latestHistoryId };
}

function headerValue(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string | undefined {
  const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value;
}

/**
 * Fetch metadata-only payload for a single message — fast and cheap
 * (no body), enough to populate from/subject/snippet for the trigger.
 */
export async function getMessageMetadata(
  accessToken: string,
  messageId: string,
): Promise<MessageMetadata | null> {
  const url = new URL(ENDPOINTS.MESSAGE(messageId));
  url.searchParams.set("format", "metadata");
  for (const h of ["From", "To", "Subject", "Date"]) {
    url.searchParams.append("metadataHeaders", h);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(
      `[GmailHistory] messages.get(${messageId}) failed: ${res.status} - ${text}`,
    );
    return null;
  }

  const raw = (await res.json()) as RawMessage;
  const headers = raw.payload?.headers ?? [];

  return {
    id: raw.id,
    threadId: raw.threadId,
    labelIds: raw.labelIds ?? [],
    snippet: raw.snippet ?? "",
    from: headerValue(headers, "From"),
    to: headerValue(headers, "To"),
    subject: headerValue(headers, "Subject"),
    date: headerValue(headers, "Date"),
    internalDate: raw.internalDate,
  };
}
