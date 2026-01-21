/**
 * Webhook Handler Tool
 *
 * Handles incoming webhooks from Slack via Mesh proxy.
 * Responsible for:
 * - Challenge verification (url_verification)
 * - Signature verification (HMAC-SHA256)
 * - Event processing
 */

import { z } from "zod";
import { createTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env";
import { handleSlackWebhookEvent } from "../slack/handlers/eventHandler";

// Input schema for the webhook tool
const WebhookInputSchema = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string()),
  body: z.string(),
});

// Output schema - HTTP response
const WebhookOutputSchema = z.object({
  status: z.number(),
  headers: z.record(z.string()).optional(),
  body: z.string(),
});

/**
 * Verify Slack request signature using HMAC-SHA256
 */
async function verifySlackSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  signingSecret: string,
): Promise<boolean> {
  const sigBasestring = `v0:${timestamp}:${rawBody}`;

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

  const computedSignature =
    "v0=" +
    Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // Constant-time comparison
  if (computedSignature.length !== signature.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < computedSignature.length; i++) {
    result |= computedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }

  return result === 0;
}

export const handleWebhook = createTool<Env, typeof WebhookInputSchema>({
  name: "handle_webhook",
  description: "Handle incoming Slack webhooks",
  inputSchema: WebhookInputSchema,
  handler: async (input, env) => {
    const { headers, body: rawBody } = input;

    // Parse body
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: 400,
              body: JSON.stringify({ error: "Invalid JSON" }),
            }),
          },
        ],
      };
    }

    // Handle url_verification challenge
    if (payload.type === "url_verification" && payload.challenge) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: 200,
              headers: { "Content-Type": "text/plain" },
              body: payload.challenge as string,
            }),
          },
        ],
      };
    }

    // Get signing secret from state
    const signingSecret = env.MESH_REQUEST_CONTEXT?.state?.SIGNING_SECRET as
      | string
      | undefined;

    if (!signingSecret) {
      console.error("[Webhook] No signing secret configured");
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: 401,
              body: JSON.stringify({ error: "Unauthorized" }),
            }),
          },
        ],
      };
    }

    // Verify signature
    const signature = headers["x-slack-signature"];
    const timestamp = headers["x-slack-request-timestamp"];

    if (!signature || !timestamp) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: 401,
              body: JSON.stringify({ error: "Unauthorized" }),
            }),
          },
        ],
      };
    }

    // Check timestamp (5 min tolerance)
    const requestTimestamp = parseInt(timestamp, 10);
    if (Number.isNaN(requestTimestamp)) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: 401,
              body: JSON.stringify({ error: "Unauthorized" }),
            }),
          },
        ],
      };
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - requestTimestamp) > 300) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: 401,
              body: JSON.stringify({ error: "Unauthorized" }),
            }),
          },
        ],
      };
    }

    // Verify HMAC signature
    const isValid = await verifySlackSignature(
      rawBody,
      signature,
      timestamp,
      signingSecret,
    );

    if (!isValid) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: 401,
              body: JSON.stringify({ error: "Unauthorized" }),
            }),
          },
        ],
      };
    }

    // Process the webhook event
    try {
      const meshConfig = {
        organizationId: env.MESH_REQUEST_CONTEXT?.organizationId ?? "",
        meshUrl: env.MESH_REQUEST_CONTEXT?.meshUrl ?? "",
        connectionId: env.MESH_REQUEST_CONTEXT?.connectionId,
      };

      await handleSlackWebhookEvent(payload, meshConfig);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: 200,
              body: JSON.stringify({ ok: true }),
            }),
          },
        ],
      };
    } catch (err) {
      console.error("[Webhook] Error processing event:", err);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: 200, // Still return 200 to acknowledge receipt
              body: JSON.stringify({ ok: true }),
            }),
          },
        ],
      };
    }
  },
});
