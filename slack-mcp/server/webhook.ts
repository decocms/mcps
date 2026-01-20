/**
 * Slack Webhook Verification and Handling
 *
 * Verifies incoming webhooks using Slack's signing secret
 * and processes different event types.
 */

import type { SlackWebhookPayload } from "./lib/types.ts";

/**
 * Verify a Slack webhook request using the signing secret
 */
export async function verifySlackRequest(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  signingSecret: string,
): Promise<{ verified: boolean; payload: SlackWebhookPayload | null }> {
  if (!signature || !timestamp) {
    console.error("[Slack Webhook] Missing signature or timestamp");
    return { verified: false, payload: null };
  }

  // Check timestamp to prevent replay attacks (5 minutes tolerance)
  const requestTimestamp = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTimestamp) > 300) {
    console.error("[Slack Webhook] Request timestamp too old");
    return { verified: false, payload: null };
  }

  // Construct the signature base string
  const sigBasestring = `v0:${timestamp}:${rawBody}`;

  // Compute HMAC SHA256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(signingSecret);
  const messageData = encoder.encode(sigBasestring);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    messageData,
  );

  // Convert to hex string
  const computedSignature =
    "v0=" +
    Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // Constant-time comparison
  if (computedSignature.length !== signature.length) {
    return { verified: false, payload: null };
  }

  let result = 0;
  for (let i = 0; i < computedSignature.length; i++) {
    result |= computedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }

  const verified = result === 0;

  if (!verified) {
    console.error("[Slack Webhook] Signature verification failed");
    return { verified: false, payload: null };
  }

  try {
    const payload = JSON.parse(rawBody) as SlackWebhookPayload;
    return { verified: true, payload };
  } catch {
    console.error("[Slack Webhook] Failed to parse payload as JSON");
    return { verified: false, payload: null };
  }
}

/**
 * Handle URL verification challenge from Slack
 */
export function handleChallenge(payload: SlackWebhookPayload): Response | null {
  if (payload.type === "url_verification" && payload.challenge) {
    return new Response(payload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return null;
}

/**
 * Parse a slash command request body
 */
export function parseSlashCommand(body: string): Record<string, string> | null {
  try {
    const params = new URLSearchParams(body);
    const result: Record<string, string> = {};

    for (const [key, value] of params.entries()) {
      result[key] = value;
    }

    return result;
  } catch {
    console.error("[Slack] Failed to parse slash command");
    return null;
  }
}

/**
 * Extract the event type from a webhook payload
 */
export function getEventType(payload: SlackWebhookPayload): string | null {
  if (payload.type === "event_callback" && payload.event) {
    return payload.event.type;
  }
  return payload.type;
}

/**
 * Check if the event should be ignored (e.g., from a bot)
 */
export function shouldIgnoreEvent(
  payload: SlackWebhookPayload,
  botUserId?: string,
): boolean {
  if (!payload.event) return false;

  const event = payload.event;

  // Ignore bot messages
  if (event.bot_id) return true;

  // Ignore messages from ourselves
  if (botUserId && event.user === botUserId) return true;

  // Ignore message subtypes that aren't actual user messages
  const ignoredSubtypes = [
    "bot_message",
    "message_changed",
    "message_deleted",
    "channel_join",
    "channel_leave",
    "channel_topic",
    "channel_purpose",
    "channel_name",
    "channel_archive",
    "channel_unarchive",
    "group_join",
    "group_leave",
    "group_topic",
    "group_purpose",
    "group_name",
    "group_archive",
    "group_unarchive",
  ];

  if (event.subtype && ignoredSubtypes.includes(event.subtype)) {
    return true;
  }

  return false;
}

/**
 * Extract user mention from message text
 */
export function extractMentions(text: string): string[] {
  const mentionRegex = /<@([A-Z0-9]+)>/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Remove bot mention from message text
 */
export function removeBotMention(text: string, botUserId: string): string {
  const mentionRegex = new RegExp(`<@${botUserId}>\\s*`, "g");
  return text.replace(mentionRegex, "").trim();
}

/**
 * Check if the bot was mentioned in the message
 */
export function isBotMentioned(text: string, botUserId: string): boolean {
  return text.includes(`<@${botUserId}>`);
}
