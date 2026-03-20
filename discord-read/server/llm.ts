/**
 * LLM Module - AI Model Integration for Discord MCP
 *
 * Thin wrapper around @decocms/mcps-shared/mesh-chat that maintains the
 * existing public API while delegating all API calls to the shared module.
 */

import type { Env } from "./types/env.ts";
import {
  generateResponse as sharedGenerateResponse,
  generateResponseWithStreaming as sharedGenerateResponseWithStreaming,
  transcribeAudio as sharedTranscribeAudio,
  type ChatMessage,
  type MeshChatConfig,
  type StreamCallback,
  type WhisperConfig,
} from "@decocms/mcps-shared/mesh-chat";

const DEFAULT_LANGUAGE_MODEL = "anthropic/claude-sonnet-4-20250514";

// ============================================================================
// Types
// ============================================================================

export interface MessageImage {
  type: "image" | "audio";
  data: string; // base64
  mimeType: string;
  name?: string;
}

export interface DiscordChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: MessageImage[];
}

export interface GenerateResponse {
  content: string;
  model: string;
  tokens?: number;
  usedFallback?: boolean;
}

export interface DiscordContext {
  guildId: string;
  channelId: string;
  userId: string;
  userName: string;
}

export type { MeshChatConfig as LLMConfig, StreamCallback };

// ============================================================================
// Global State
// ============================================================================

let globalLLMConfig: MeshChatConfig | null = null;
let streamingEnabled = true;
let globalWhisperConfig: WhisperConfig | null = null;

export function configureLLM(config: MeshChatConfig): void {
  globalLLMConfig = config;
  console.log("[LLM] Configured", {
    meshUrl: config.meshUrl,
    organizationId: config.organizationId,
    modelProviderId: config.modelProviderId,
    modelId: config.modelId,
    agentId: config.agentId,
    hasToken: !!config.token,
    hasSystemPrompt: !!config.systemPrompt,
  });
}

export function clearLLMConfig(): void {
  globalLLMConfig = null;
  console.log("[LLM] Config cleared");
}

export function configureStreaming(enabled: boolean): void {
  streamingEnabled = enabled;
  console.log("[LLM] Streaming:", enabled ? "enabled" : "disabled");
}

export function isStreamingEnabled(): boolean {
  return streamingEnabled;
}

export function isLLMConfigured(): boolean {
  return globalLLMConfig !== null;
}

export function getLLMConfig(): MeshChatConfig | null {
  return globalLLMConfig;
}

// ============================================================================
// Helpers
// ============================================================================

function toSharedMessages(messages: DiscordChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    media: m.images?.map((img) => ({
      type: img.type,
      data: img.data,
      mimeType: img.mimeType,
      name: img.name,
    })),
  }));
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate a response using the Mesh API.
 * Falls back to stored config or env-derived config if global config is not set.
 */
export async function generateResponse(
  env: Env,
  messages: DiscordChatMessage[],
  _options?: { discordContext?: DiscordContext },
): Promise<GenerateResponse> {
  let config = globalLLMConfig;

  if (!config) {
    // Fallback 1: Try stored config (persistent, doesn't depend on env)
    const { getStoredConfig, getCurrentEnv } = await import("./bot-manager.ts");
    const storedConfig = getStoredConfig();

    if (storedConfig) {
      console.log("[LLM] Using stored config fallback", {
        isApiKey: storedConfig.isApiKey,
        hasToken: !!storedConfig.persistentToken,
      });
      config = {
        meshUrl: storedConfig.meshUrl,
        organizationId: storedConfig.organizationId,
        token: storedConfig.persistentToken,
        modelProviderId: storedConfig.modelProviderId ?? "",
        modelId: storedConfig.modelId,
        agentId: storedConfig.agentId,
      };
    } else {
      // Fallback 2: Build config from env (may have expired token)
      const storedEnv = getCurrentEnv();
      const effectiveEnv = env.MESH_REQUEST_CONTEXT?.state?.LANGUAGE_MODEL
        ?.value
        ? env
        : storedEnv?.MESH_REQUEST_CONTEXT?.state?.LANGUAGE_MODEL?.value
          ? storedEnv
          : env;

      const organizationId = effectiveEnv.MESH_REQUEST_CONTEXT?.organizationId;
      if (!organizationId) {
        throw new Error(
          "No organizationId found. Please open Mesh Dashboard and click 'Save' on this MCP to refresh the connection.",
        );
      }

      const meshUrl =
        effectiveEnv.MESH_REQUEST_CONTEXT?.meshUrl ?? effectiveEnv.MESH_URL;
      const token = effectiveEnv.MESH_REQUEST_CONTEXT?.token;
      const state = effectiveEnv.MESH_REQUEST_CONTEXT?.state;
      const modelId =
        state?.LANGUAGE_MODEL?.value?.id ?? DEFAULT_LANGUAGE_MODEL;
      const connectionId = state?.LANGUAGE_MODEL?.value?.connectionId;
      const agentId = state?.AGENT?.value;

      if (!modelId) {
        throw new Error(
          "LANGUAGE_MODEL not configured.\n\n" +
            "🔧 **How to fix:**\n" +
            "1. Open **Mesh Dashboard**\n" +
            "2. Go to this MCP's configuration\n" +
            "3. Configure **LANGUAGE_MODEL**\n" +
            "4. Click **Save** to apply",
        );
      }

      config = {
        meshUrl,
        organizationId,
        token,
        modelProviderId: connectionId,
        modelId,
        agentId,
      };
    }
  }

  const text = await sharedGenerateResponse(config, toSharedMessages(messages));

  return {
    content: text,
    model: config.modelId ?? DEFAULT_LANGUAGE_MODEL,
    usedFallback: false,
  };
}

/**
 * Generate a response with real-time streaming callback.
 * Uses the global config if no config is explicitly provided.
 */
export async function generateResponseWithStreaming(
  messages: DiscordChatMessage[],
  onStream: StreamCallback,
  config?: MeshChatConfig,
): Promise<string> {
  const effectiveConfig = config ?? globalLLMConfig;

  if (!effectiveConfig) {
    throw new Error("LLM not configured");
  }

  return sharedGenerateResponseWithStreaming(
    effectiveConfig,
    toSharedMessages(messages),
    onStream,
  );
}

// ============================================================================
// Whisper Integration
// ============================================================================

export function configureWhisper(config: WhisperConfig): void {
  globalWhisperConfig = config;
  console.log("[Whisper] Configured", {
    meshUrl: config.meshUrl,
    whisperConnectionId: config.whisperConnectionId,
    hasToken: !!config.token,
  });
}

export function isWhisperConfigured(): boolean {
  return globalWhisperConfig !== null;
}

export async function transcribeAudio(
  audioUrl: string,
  _mimeType: string,
  filename: string,
): Promise<string | null> {
  if (!globalWhisperConfig) {
    console.log("[Whisper] Not configured, skipping transcription");
    return null;
  }

  return sharedTranscribeAudio(globalWhisperConfig, audioUrl, filename);
}
