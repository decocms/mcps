/**
 * Tool: Start Streaming Session
 * Prepare a streaming chat completion session and return a URL
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "../../main.ts";
import { AUTO_ROUTER_MODEL, DEFAULT_TEMPERATURE } from "../../constants.ts";
import {
  buildStreamingUrl,
  createStreamingSession,
  getStreamingInstructions,
  validateChatParams,
} from "./utils.ts";
import type { ChatMessage, ProviderPreferences } from "../../lib/types.ts";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  name: z.string().optional(),
});

const ProviderPreferencesSchema = z.object({
  sort: z.enum(["price", "throughput", "latency"]).optional(),
  only: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  requireParameters: z.boolean().optional(),
  allowFallbacks: z.boolean().optional(),
});

export const createStartStreamTool = (env: Env) =>
  createPrivateTool({
    id: "OPENROUTER_START_STREAM",
    description:
      "Prepare a streaming chat completion session. Returns a URL that can be used to stream responses " +
      "via Server-Sent Events (SSE). The stream URL is authenticated and pre-configured with all parameters. " +
      "Perfect for real-time chat applications where you want to display responses as they're generated. " +
      "Note: MCP doesn't support streaming in tool responses, so you'll need to connect to the URL directly " +
      "to consume the stream.",
    inputSchema: z.object({
      messages: z
        .array(MessageSchema)
        .min(1)
        .describe("Array of messages in the conversation"),
      model: z
        .string()
        .default(AUTO_ROUTER_MODEL)
        .optional()
        .describe(
          "Model ID or 'openrouter/auto' for automatic selection. Default: openrouter/auto",
        ),
      models: z
        .array(z.string())
        .optional()
        .describe("Fallback chain: array of model IDs to try in sequence"),
      temperature: z
        .number()
        .min(0)
        .max(2)
        .optional()
        .describe("Sampling temperature (0-2)"),
      maxTokens: z
        .number()
        .positive()
        .optional()
        .describe("Maximum tokens to generate"),
      topP: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Nucleus sampling (0-1)"),
      frequencyPenalty: z
        .number()
        .min(-2)
        .max(2)
        .optional()
        .describe("Frequency penalty (-2 to 2)"),
      presencePenalty: z
        .number()
        .min(-2)
        .max(2)
        .optional()
        .describe("Presence penalty (-2 to 2)"),
      stop: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Stop sequences"),
      provider: ProviderPreferencesSchema.optional().describe(
        "Provider routing preferences",
      ),
      user: z.string().optional().describe("Unique user identifier"),
    }),
    outputSchema: z.object({
      streamUrl: z
        .string()
        .url()
        .describe(
          "SSE endpoint URL to connect for streaming (use EventSource or SSE client)",
        ),
      sessionId: z.string().describe("Unique session ID for this stream"),
      expiresAt: z
        .string()
        .describe(
          "ISO timestamp when this session expires (5 minutes from creation)",
        ),
      instructions: z
        .string()
        .describe("Instructions on how to consume the stream using SSE"),
    }),
    execute: async ({
      context,
    }: {
      context: {
        messages: ChatMessage[];
        model?: string;
        models?: string[];
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        frequencyPenalty?: number;
        presencePenalty?: number;
        stop?: string | string[];
        provider?: ProviderPreferences;
        user?: string;
      };
    }) => {
      const {
        messages,
        model = AUTO_ROUTER_MODEL,
        models,
        temperature,
        maxTokens,
        topP,
        frequencyPenalty,
        presencePenalty,
        stop,
        provider,
        user,
      } = context;

      const resolvedTemperature =
        temperature ?? env.state.defaultTemperature ?? DEFAULT_TEMPERATURE;
      const resolvedMaxTokens = maxTokens ?? env.state.defaultMaxTokens;

      // Validate parameters
      validateChatParams({
        messages,
        model,
        temperature: resolvedTemperature,
        maxTokens: resolvedMaxTokens,
        topP,
      });

      // Get the base URL from the request
      // This is a workaround since we don't have direct access to the request URL
      // In production, you might want to configure this as an environment variable
      const baseUrl = env.state.siteUrl || "https://your-worker.workers.dev";

      // Create streaming session
      const session = createStreamingSession({
        model,
        messages,
        temperature: resolvedTemperature,
        max_tokens: resolvedMaxTokens,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        stop,
        models,
        provider,
        user,
        stream: true, // Force streaming
      });

      // Persist session so streaming endpoint can retrieve it
      await env.STREAM_SESSIONS.put(
        session.sessionId,
        JSON.stringify(session),
        {
          expiration: Math.floor(session.expiresAt / 1000),
        },
      );

      // Build streaming URL
      const streamUrl = buildStreamingUrl(baseUrl, session.sessionId);

      return {
        streamUrl,
        sessionId: session.sessionId,
        expiresAt: new Date(session.expiresAt).toISOString(),
        instructions: getStreamingInstructions(),
      };
    },
  });
