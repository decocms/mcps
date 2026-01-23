/**
 * GitHub Webhook Handler Tool
 *
 * Streamable tool that receives GitHub webhook events and publishes them
 * to the Event Bus. Validates webhook signatures using HMAC SHA-256 when
 * a webhook secret is configured.
 */

import { type CreatedTool, createRuntimeContext } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

/**
 * Verify GitHub webhook signature using HMAC SHA-256
 *
 * GitHub sends the signature in the x-hub-signature-256 header as:
 * sha256=<hex-digest>
 */
async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!secret) {
    // No secret configured, skip validation
    console.log(
      "[GitHub Webhook] No webhook secret configured, skipping signature validation",
    );
    return true;
  }

  if (!signature) {
    console.warn("[GitHub Webhook] Missing signature header");
    return false;
  }

  // Extract the hash from "sha256=<hash>"
  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) {
    console.warn("[GitHub Webhook] Invalid signature format");
    return false;
  }

  const signatureHash = signature.slice(expectedPrefix.length);

  // Compute HMAC SHA-256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody),
  );
  const computedHash = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  if (computedHash.length !== signatureHash.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ signatureHash.charCodeAt(i);
  }

  return result === 0;
}

/**
 * GitHub webhook payload schema (passthrough to accept any GitHub event)
 *
 * GitHub sends different payloads for different events, so we use passthrough
 * to accept any valid JSON while extracting common fields.
 */
const GitHubWebhookPayloadSchema = z
  .object({
    action: z.string().optional(),
    sender: z
      .object({
        login: z.string(),
        id: z.number(),
      })
      .loose()
      .optional(),
    repository: z
      .object({
        id: z.number(),
        name: z.string(),
        full_name: z.string(),
        owner: z.object({ login: z.string() }).passthrough(),
      })
      .loose()
      .optional(),
    organization: z
      .object({
        login: z.string(),
        id: z.number(),
      })
      .loose()
      .optional(),
    installation: z
      .object({
        id: z.number(),
      })
      .loose()
      .optional(),
    // GitHub event type header value (passed as body field by some proxies)
    _github_event: z.string().optional(),
  })
  .loose();

type GitHubWebhookPayload = z.infer<typeof GitHubWebhookPayloadSchema>;

/**
 * Create the GitHub webhook handler streamable tool
 *
 * This tool is called directly by GitHub webhooks via the endpoint:
 * ${meshUrl}/mcp/${connectionId}/call-tool/MESH_PUBLIC_GITHUB_WEBHOOK
 *
 * Security:
 * - connectionId in URL provides authentication (only correct connectionId can invoke)
 * - Webhook signature validation using HMAC SHA-256 (when secret is configured)
 */
export const createGitHubWebhookTool = (env: Env): CreatedTool => ({
  _meta: {
    "mcp.mesh": {
      public_tool: true,
    },
  },
  streamable: true,
  id: "MESH_PUBLIC_GITHUB_WEBHOOK",
  description:
    "Receives GitHub webhook events and publishes them to the Event Bus. " +
    "This endpoint is called directly by GitHub when webhook events occur.",
  inputSchema: GitHubWebhookPayloadSchema.loose(),
  execute: async ({ context, runtimeContext }) => {
    runtimeContext ??= createRuntimeContext(runtimeContext);

    const payload = context as GitHubWebhookPayload;

    // Use runtimeContext.env for the current request's environment if available
    const currentEnv = runtimeContext?.env
      ? (runtimeContext.env as unknown as Env)
      : env;

    // Get request from runtimeContext for header access
    const req = runtimeContext?.req as Request | undefined;

    // Validate webhook signature if secret is configured

    if (WEBHOOK_SECRET && req) {
      const signature = req.headers.get("x-hub-signature-256");
      // Note: We use the serialized context since the raw body may not be available
      const bodyForValidation = JSON.stringify(context);

      const isValid = await verifyWebhookSignature(
        bodyForValidation,
        signature,
        WEBHOOK_SECRET,
      );

      if (!isValid) {
        console.error("[GitHub Webhook] Invalid signature");
        return { error: "Invalid webhook signature" };
      }

      console.log("[GitHub Webhook] Signature validated successfully");
    }

    // Get event type from x-github-event header (preferred) or payload field
    const eventType =
      req?.headers.get("x-github-event") || payload._github_event || "webhook";

    console.log(`[GitHub Webhook] Received event: ${eventType}`, {
      action: payload.action,
      repo: payload.repository?.full_name,
      sender: payload.sender?.login,
    });

    // Determine the event subject (usually repository full name)
    const subject =
      payload.repository?.full_name || payload.organization?.login || "unknown";

    // Build full event type: github.<event>.<action>
    // e.g., github.pull_request.opened, github.push
    const fullEventType = payload.action
      ? `github.${eventType}.${payload.action}`
      : `github.${eventType}`;

    try {
      // Publish the event to the Event Bus
      await currentEnv.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS?.EVENT_PUBLISH({
        type: fullEventType,
        data: payload,
        subject,
      });

      console.log(`[GitHub Webhook] Published event: ${fullEventType}`, {
        subject,
      });

      return {
        success: true,
        event: fullEventType,
        subject,
      };
    } catch (error) {
      console.error("[GitHub Webhook] Failed to publish event:", error);
      return {
        error: "Failed to publish event",
        details: String(error),
      };
    }
  },
});
