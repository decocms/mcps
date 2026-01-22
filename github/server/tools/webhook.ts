/**
 * GitHub Webhook Handler Tool
 *
 * Streamable tool that receives GitHub webhook events and publishes them
 * to the Event Bus.
 *
 * Note: The webhook endpoint is protected by the connectionId in the URL,
 * which provides authentication. Full signature validation would require
 * access to request headers which isn't currently available in streamable tools.
 */

import { createStreamableTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

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
 * ${meshUrl}/mcp/${connectionId}/call-tool/GITHUB_WEBHOOK
 *
 * The connectionId in the URL provides authentication - only the correct
 * connectionId can invoke this tool.
 */
export const createGitHubWebhookTool = (env: Env) =>
  createStreamableTool({
    id: "GITHUB_WEBHOOK",
    description:
      "Receives GitHub webhook events and publishes them to the Event Bus. " +
      "This endpoint is called directly by GitHub when webhook events occur.",
    inputSchema: GitHubWebhookPayloadSchema,
    execute: async ({ context, runtimeContext }) => {
      const payload = context as GitHubWebhookPayload;

      // Use runtimeContext.env for the current request's environment if available
      // Fall back to the env from tool creation
      const currentEnv = runtimeContext?.env
        ? (runtimeContext.env as unknown as Env)
        : env;

      // TODO: Implement signature validation when request headers become available
      // in streamable tools. For now, the connectionId in the URL provides
      // authentication - only requests to the correct connectionId can invoke this tool.
      //
      // Future implementation:
      // const signature = request.headers.get("x-hub-signature-256");
      // const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);

      // Try to determine event type from payload
      // GitHub sends this in the x-github-event header, but we may receive it
      // as a body field if a proxy forwards it
      const eventType = payload._github_event || "webhook";

      console.log(`[GitHub Webhook] Received event: ${eventType}`, {
        action: payload.action,
        repo: payload.repository?.full_name,
        sender: payload.sender?.login,
      });

      // Determine the event subject (usually repository full name)
      const subject =
        payload.repository?.full_name ||
        payload.organization?.login ||
        "unknown";

      // Determine the specific event type
      // GitHub event types are like: push, pull_request, issues
      // Actions are like: opened, closed, synchronize
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

        return new Response(
          JSON.stringify({
            success: true,
            event: fullEventType,
            subject,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      } catch (error) {
        console.error("[GitHub Webhook] Failed to publish event:", error);
        return new Response(
          JSON.stringify({
            error: "Failed to publish event",
            details: String(error),
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    },
  });
