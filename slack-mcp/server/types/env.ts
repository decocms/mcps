/**
 * Environment Type Definitions for Slack MCP
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import z from "zod";

export const StateSchema = z.object({
  // Bindings (AI connections)
  EVENT_BUS: BindingOf("@deco/event-bus"),
  DATABASE: BindingOf("@deco/postgres").optional(),
  MODEL_PROVIDER: BindingOf("@deco/llm").describe(
    "AI Model Provider connection",
  ),
  AGENT: BindingOf("@deco/agent").describe(
    "Agent with tools, resources and prompts",
  ),
  LANGUAGE_MODEL: z
    .object({
      __type: z.literal("@deco/language-model"),
      value: z
        .object({
          id: z.string(),
        })
        .loose()
        .describe("The language model to use for agent responses."),
    })
    .optional(),

  // Webhook URL (read-only template)
  WEBHOOK_URL: z
    .string()
    .default(
      "https://sites-slack-mcp.decocache.com/slack/events/{connectionId}",
    )
    .readonly()
    .describe(
      "Webhook URL for Slack Event Subscriptions. Replace {connectionId} with your connection ID (visible in the browser URL).",
    ),

  // Slack App Credentials
  SLACK_CREDENTIALS: z
    .object({
      BOT_TOKEN: z
        .string()
        .describe("Slack Bot User OAuth Token (starts with xoxb-)"),
      SIGNING_SECRET: z
        .string()
        .describe(
          "Slack Signing Secret for verifying incoming webhook requests",
        ),
    })
    .describe("Slack App credentials from api.slack.com"),

  // Channel Configuration
  CHANNEL_CONFIG: z
    .object({
      ALLOWED_CHANNELS: z
        .array(z.string())
        .optional()
        .describe(
          "List of channel IDs the bot can respond in. Leave empty to allow all channels.",
        ),
      LOG_CHANNEL_ID: z
        .string()
        .optional()
        .describe("Channel ID where the bot sends debug and status logs"),
    })
    .optional()
    .describe("Channel restrictions and logging settings"),

  // Conversation Context Configuration
  CONTEXT_CONFIG: z
    .object({
      MAX_MESSAGES_TO_FETCH: z
        .number()
        .default(50)
        .describe(
          "Maximum previous messages to fetch for conversation context. Set to 0 to disable context.",
        ),
      MAX_MESSAGES_BEFORE_SUMMARY: z
        .number()
        .default(10)
        .describe(
          "When context has more messages than this, older ones are summarized instead of sent in full.",
        ),
      RECENT_MESSAGES_TO_KEEP: z
        .number()
        .default(5)
        .describe(
          "Number of most recent messages to always keep in full (not summarized).",
        ),
      THREAD_TIMEOUT_MIN: z
        .number()
        .default(10)
        .describe(
          "Minutes of inactivity before a conversation thread is considered expired. New messages start fresh context.",
        ),
    })
    .optional()
    .describe("How conversation history is managed and sent to the LLM"),

  // Response Configuration
  RESPONSE_CONFIG: z
    .object({
      ENABLE_STREAMING: z
        .boolean()
        .default(true)
        .describe(
          "Stream responses in real-time (message updates as LLM generates). Disable for a single final response.",
        ),
    })
    .optional()
    .describe("How the bot responds to messages"),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
export type { Registry };
