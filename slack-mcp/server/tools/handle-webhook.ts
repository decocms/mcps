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
import type { Env } from "../types/env.ts";
import { handleSlackWebhookEvent } from "../slack/handlers/eventHandler.ts";
import { ensureSlackClient } from "../lib/slack-client.ts";

// Input schema for the webhook tool
const WebhookInputSchema = z
  .object({
    method: z.string(),
    url: z.string(),
    headers: z.record(z.string(), z.string()),
    body: z.string(),
  })
  .strict();

// Output schema - HTTP response
const WebhookOutputSchema = z
  .object({
    status: z.number(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string(),
  })
  .strict();

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

/**
 * Create response object for MCP tool result
 */
function createResponse(
  status: number,
  body: string,
  headers?: Record<string, string>,
) {
  return {
    status,
    headers,
    body,
  };
}

/**
 * Factory function to create the webhook handler tool
 */
export const createHandleWebhookTool = (env: Env) =>
  createTool({
    id: "handle_webhook",
    description:
      "Handle incoming Slack webhooks. Verifies signature and processes events.",
    inputSchema: WebhookInputSchema,
    outputSchema: WebhookOutputSchema,
    execute: async ({ context }: { context: unknown }) => {
      const input = context as z.infer<typeof WebhookInputSchema>;
      const { headers, body: rawBody } = input;

      // Parse body
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return createResponse(400, JSON.stringify({ error: "Invalid JSON" }));
      }

      // Handle url_verification challenge
      if (payload.type === "url_verification" && payload.challenge) {
        return createResponse(200, payload.challenge as string, {
          "Content-Type": "text/plain",
        });
      }

      // Get signing secret from state
      const signingSecret = env.MESH_REQUEST_CONTEXT?.state?.SIGNING_SECRET as
        | string
        | undefined;

      if (!signingSecret) {
        console.error("[Webhook] No signing secret configured");
        return createResponse(401, JSON.stringify({ error: "Unauthorized" }));
      }

      // Initialize Slack client with bot token
      const botToken = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN as
        | string
        | undefined;
      if (botToken) {
        ensureSlackClient(botToken);
      }

      // Verify signature
      const signature = headers["x-slack-signature"];
      const timestamp = headers["x-slack-request-timestamp"];

      if (!signature || !timestamp) {
        return createResponse(401, JSON.stringify({ error: "Unauthorized" }));
      }

      // Check timestamp (5 min tolerance)
      const requestTimestamp = parseInt(timestamp, 10);
      if (Number.isNaN(requestTimestamp)) {
        return createResponse(401, JSON.stringify({ error: "Unauthorized" }));
      }

      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - requestTimestamp) > 300) {
        return createResponse(401, JSON.stringify({ error: "Unauthorized" }));
      }

      // Verify HMAC signature
      const isValid = await verifySlackSignature(
        rawBody,
        signature,
        timestamp,
        signingSecret,
      );

      if (!isValid) {
        return createResponse(401, JSON.stringify({ error: "Unauthorized" }));
      }

      // Process the webhook event
      try {
        const meshConfig = {
          organizationId: env.MESH_REQUEST_CONTEXT?.organizationId ?? "",
          meshUrl: env.MESH_REQUEST_CONTEXT?.meshUrl ?? "",
          connectionId: env.MESH_REQUEST_CONTEXT?.connectionId,
        };

        await handleSlackWebhookEvent(payload, meshConfig);

        return createResponse(200, JSON.stringify({ ok: true }));
      } catch (err) {
        console.error("[Webhook] Error processing event:", err);
        // Still return 200 to acknowledge receipt
        return createResponse(200, JSON.stringify({ ok: true }));
      }
    },
  });
