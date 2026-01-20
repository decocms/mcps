/**
 * Environment Type Definitions for Slack MCP
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import z from "zod";

export const StateSchema = z.object({
  // Bindings
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

  // Slack App Credentials
  BOT_TOKEN: z.string().describe("Slack Bot Token (xoxb-...)"),
  SIGNING_SECRET: z
    .string()
    .describe("Slack Signing Secret for webhook verification"),
  APP_TOKEN: z
    .string()
    .optional()
    .describe("Slack App Token for Socket Mode (xapp-...)"),

  // Configuration
  ALLOWED_CHANNELS: z
    .string()
    .optional()
    .describe(
      "IDs de canais permitidos (separados por vírgula). Deixe vazio para todos.",
    ),
  THREAD_TIMEOUT_MIN: z
    .number()
    .default(10)
    .describe("Timeout de inatividade da thread em minutos"),
  LOG_CHANNEL_ID: z.string().optional().describe("Canal para logs do bot"),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
export type { Registry };
