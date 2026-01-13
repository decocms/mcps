/**
 * Environment Type Definitions
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import z from "zod";

export const StateSchema = z.object({
  // Bindings obrigatórias
  DATABASE: BindingOf("@deco/postgres"),
  EVENT_BUS: BindingOf("@deco/event-bus"),

  // AI Configuration (igual ao mcp-studio)
  MODEL_PROVIDER: BindingOf("@deco/llm").describe(
    "AI Model Provider connection",
  ),
  AGENT: BindingOf("@deco/agent").describe(
    "Agent with tools, resources and prompts",
  ),
  LANGUAGE_MODEL: z.object({
    __type: z.literal("@deco/language-model"),
    value: z
      .object({
        id: z.string(),
      })
      .loose()
      .describe("The language model to use for agent responses."),
  }),

  // Config do Discord Bot
  BOT_TOKEN: z.string().describe("Discord Bot Token"),
  COMMAND_PREFIX: z
    .string()
    .default("!")
    .describe("Prefixo para comandos (ex: ! ou d!)"),
  GUILD_ID: z
    .string()
    .optional()
    .describe("Guild ID para comandos específicos"),
  LOG_CHANNEL_ID: z.string().optional().describe("Canal para logs do bot"),
});

// @ts-expect-error - Runtime expects internal Zod types that differ from project's Zod
export type Env = DefaultEnv<typeof StateSchema, Registry>;
export type { Registry };
