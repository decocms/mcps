/**
 * Environment Type Definitions for Discord MCP
 */

import type { Registry } from "@decocms/mcps-shared/registry";
import { BindingOf, type DefaultEnv } from "@decocms/runtime";
import z from "zod";

export const StateSchema = z.object({
  // Bindings obrigatórias
  DATABASE: BindingOf("@deco/postgres"),
  EVENT_BUS: BindingOf("@deco/event-bus"),
  CONNECTION: BindingOf("@deco/connection"),

  // AI Configuration (igual ao mcp-studio)
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
    .required(),

  // Whisper for audio transcription (optional)
  WHISPER: BindingOf("@deco/whisper")
    .optional()
    .describe(
      "OpenAI Whisper for audio transcription. If not set, audio files will not be processed.",
    ),

  // Agent Mode Configuration
  AGENT_MODE: z
    .enum(["passthrough", "smart_tool_selection", "code_execution"])
    .default("smart_tool_selection")
    .optional()
    .describe(
      "Agent execution mode: 'passthrough' (no tool filtering), 'smart_tool_selection' (AI decides tools), 'code_execution' (full code execution)",
    ),

  // Config do Discord Bot
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
    })
    .optional()
    .describe("How the bot responds to messages"),

  // Voice Configuration (Fase 2)
  VOICE_CONFIG: z
    .object({
      ENABLED: z
        .boolean()
        .default(true)
        .describe("Enable voice channel features"),
      AUTO_JOIN_CHANNEL_ID: z
        .string()
        .optional()
        .describe("Voice channel ID to auto-join on startup"),
      RESPONSE_MODE: z
        .enum(["voice", "dm", "both"])
        .default("voice")
        .describe("How to respond to voice commands: voice (TTS), dm, or both"),
      TTS_ENABLED: z
        .boolean()
        .default(true)
        .describe("Enable Text-to-Speech responses in voice channel"),
      TTS_LANGUAGE: z
        .string()
        .default("pt-BR")
        .describe("Language for TTS (e.g., pt-BR, en-US)"),
      SILENCE_THRESHOLD_MS: z
        .number()
        .default(1000)
        .describe("Milliseconds of silence before processing audio"),
      ELEVENLABS_API_KEY: z
        .string()
        .optional()
        .describe(
          "ElevenLabs API Key for high-quality TTS (if not set, uses Discord native TTS)",
        ),
      ELEVENLABS_VOICE_ID: z
        .string()
        .default("JBFqnCBsd6RMkjVDRZzb")
        .describe("ElevenLabs Voice ID to use (default: George)"),
    })
    .optional()
    .describe("Voice channel configuration for voice commands and TTS"),

  // HyperDX Configuration
  HYPERDX_API_KEY: z
    .string()
    .optional()
    .describe(
      "HyperDX API key for advanced logging and observability. If not provided, logs will only go to stdout.",
    ),
});

export type Env = DefaultEnv<typeof StateSchema, Registry>;
export type { Registry };
