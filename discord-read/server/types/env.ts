/**
 * Environment Type Definitions for Discord MCP
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { AgentOf, type DefaultEnv } from "@decocms/runtime";
import z from "zod";

export const StateSchema = z.object({
  // AI Configuration — AgentOf() resolves to a client with .STREAM()
  AGENT: AgentOf(),

  // ============================================================================
  // Discord Webhook Configuration (required for /interactions endpoint)
  // ============================================================================
  DISCORD_PUBLIC_KEY: z
    .string()
    .optional()
    .describe(
      "Discord Application Public Key (from Discord Developer Portal > General Information). Required for webhook signature verification.",
    ),

  DISCORD_APPLICATION_ID: z
    .string()
    .optional()
    .describe(
      "Discord Application ID (from Discord Developer Portal). Required for slash commands registration.",
    ),

  AUTHORIZED_GUILDS: z
    .string()
    .optional()
    .describe(
      "List of authorized Guild IDs separated by comma (e.g., '123456789,987654321'). Leave empty to allow all guilds.",
    ),

  BOT_OWNER_ID: z
    .string()
    .optional()
    .describe(
      "Discord User ID of the bot owner. Used for admin-only commands.",
    ),

  BOT_SUPER_ADMINS: z
    .string()
    .optional()
    .describe(
      "Comma-separated list of Discord User IDs with super admin permissions (bypass all role checks). Example: '607266543859925014,123456789'",
    ),

  // ============================================================================
  // Config do Discord Bot
  // ============================================================================
  // Note: BOT_TOKEN is now passed via Authorization header (auth.type: "token" in app.json)
  COMMAND_PREFIX: z
    .string()
    .default("!")
    .describe("Prefixo para comandos (ex: ! ou d!)"),
  GUILD_ID: z
    .string()
    .optional()
    .describe("Guild ID para comandos específicos"),
  LOG_CHANNEL_ID: z.string().optional().describe("Canal para logs do bot"),

  // Permissions
  ALLOWED_ROLES: z
    .string()
    .optional()
    .describe(
      "IDs de cargos permitidos a usar o bot (separados por vírgula). Deixe vazio para permitir todos.",
    ),
  ALLOW_DM: z
    .boolean()
    .default(true)
    .describe("Permitir mensagens diretas (DM) ao bot"),
  DM_ALLOWED_USERS: z
    .string()
    .optional()
    .describe(
      "IDs de usuários permitidos a usar o bot via DM (separados por vírgula). Deixe vazio para permitir todos.",
    ),

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
          "Minutes of inactivity before a conversation thread is considered expired.",
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
      THINKING_MESSAGE: z
        .string()
        .default("🤔 Pensando")
        .describe(
          "Message shown while the bot is thinking (e.g. '🤔 Pensando', '🤔 Thinking'). Dots are animated automatically.",
        ),
      TOOL_PROCESSING_MESSAGE: z
        .string()
        .default("🔧 Processando...")
        .describe(
          "Message shown while a tool is being executed (e.g. '🔧 Processando...', '🔧 Processing...')",
        ),
    })
    .optional()
    .describe("How the bot responds to messages"),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
export type { Registry };
