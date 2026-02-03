/**
 * Discord Configuration Tools
 *
 * Tools for saving and managing Discord bot configuration.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import {
  getDiscordConfig,
  setDiscordConfig,
  deleteDiscordConfig,
  getCacheStats,
  clearConfigCache,
  type DiscordConfig,
} from "../lib/config-cache.ts";
import { isSupabaseConfigured } from "../lib/supabase-client.ts";

/**
 * Save Discord bot configuration
 */
export const createSaveConfigTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_SAVE_CONFIG",
    description:
      "Save Discord bot configuration (token, authorized guilds, AI model settings). This persists configuration so you don't need to provide the token again.",
    inputSchema: z
      .object({
        botToken: z
          .string()
          .describe("Discord bot token (from Discord Developer Portal)"),
        authorizedGuilds: z
          .array(z.string())
          .optional()
          .describe(
            "List of guild IDs that can use this bot (empty = all guilds allowed)",
          ),
        ownerId: z
          .string()
          .optional()
          .describe("Discord user ID of the bot owner (for admin commands)"),
        commandPrefix: z
          .string()
          .default("!")
          .describe("Command prefix for bot commands"),
        modelProviderId: z
          .string()
          .optional()
          .describe("Model provider connection ID for AI responses"),
        modelId: z.string().optional().describe("Model ID to use"),
        agentId: z.string().optional().describe("Agent ID to use"),
        systemPrompt: z
          .string()
          .optional()
          .describe("Custom system prompt for AI agent"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        connectionId: z.string(),
        supabaseConfigured: z.boolean(),
      })
      .strict(),
    execute: async (params: any) => {
      const { context, env } = params;
      const {
        botToken,
        authorizedGuilds,
        ownerId,
        commandPrefix,
        modelProviderId,
        modelId,
        agentId,
        systemPrompt,
      } = context as {
        botToken: string;
        authorizedGuilds?: string[];
        ownerId?: string;
        commandPrefix?: string;
        modelProviderId?: string;
        modelId?: string;
        agentId?: string;
        systemPrompt?: string;
      };

      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        return {
          success: false,
          message:
            "Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
          connectionId: "",
          supabaseConfigured: false,
        };
      }

      // Get connection ID from env
      const connectionId =
        env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";
      const organizationId =
        env.MESH_REQUEST_CONTEXT?.organizationId || "default-org";
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl || "";

      // Create config object
      const config: DiscordConfig = {
        connectionId,
        organizationId,
        meshUrl,
        meshToken: undefined, // Will be set by mesh
        botToken,
        authorizedGuilds: authorizedGuilds || [],
        ownerId,
        commandPrefix: commandPrefix || "!",
        modelProviderId,
        modelId,
        agentId,
        systemPrompt,
      };

      try {
        await setDiscordConfig(config);

        return {
          success: true,
          message: `Discord bot configuration saved successfully! ${
            authorizedGuilds && authorizedGuilds.length > 0
              ? `Bot authorized for ${authorizedGuilds.length} guild(s).`
              : "Bot can be used in all guilds."
          }`,
          connectionId,
          supabaseConfigured: true,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to save configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
          connectionId,
          supabaseConfigured: true,
        };
      }
    },
  });

/**
 * Load Discord bot configuration
 */
export const createLoadConfigTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_LOAD_CONFIG",
    description:
      "Load saved Discord bot configuration from Supabase. Returns the stored bot token and settings.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        config: z
          .object({
            connectionId: z.string(),
            organizationId: z.string(),
            botToken: z.string(),
            authorizedGuilds: z.array(z.string()).optional(),
            ownerId: z.string().optional(),
            commandPrefix: z.string(),
            modelProviderId: z.string().optional(),
            modelId: z.string().optional(),
            agentId: z.string().optional(),
            systemPrompt: z.string().optional(),
            configuredAt: z.string().optional(),
            updatedAt: z.string().optional(),
          })
          .optional(),
        message: z.string(),
        supabaseConfigured: z.boolean(),
      })
      .strict(),
    execute: async (params: any) => {
      const { env } = params;
      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        return {
          success: false,
          message:
            "Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.",
          supabaseConfigured: false,
        };
      }

      // Get connection ID from env
      const connectionId =
        env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

      try {
        const config = await getDiscordConfig(connectionId);

        if (!config) {
          return {
            success: false,
            message: `No configuration found for connection: ${connectionId}. Use DISCORD_SAVE_CONFIG to save configuration first.`,
            supabaseConfigured: true,
          };
        }

        return {
          success: true,
          config: {
            connectionId: config.connectionId,
            organizationId: config.organizationId,
            botToken: config.botToken,
            authorizedGuilds: config.authorizedGuilds,
            ownerId: config.ownerId,
            commandPrefix: config.commandPrefix || "!",
            modelProviderId: config.modelProviderId,
            modelId: config.modelId,
            agentId: config.agentId,
            systemPrompt: config.systemPrompt,
            configuredAt: config.configuredAt,
            updatedAt: config.updatedAt,
          },
          message: "Configuration loaded successfully",
          supabaseConfigured: true,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to load configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
          supabaseConfigured: true,
        };
      }
    },
  });

/**
 * Delete Discord bot configuration
 */
export const createDeleteConfigTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_DELETE_CONFIG",
    description:
      "Delete saved Discord bot configuration from Supabase. This will remove the stored token and settings.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
      })
      .strict(),
    execute: async (params: any) => {
      const { env } = params;
      if (!isSupabaseConfigured()) {
        return {
          success: false,
          message: "Supabase not configured",
        };
      }

      const connectionId =
        env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

      try {
        await deleteDiscordConfig(connectionId);

        return {
          success: true,
          message: `Configuration deleted successfully for connection: ${connectionId}`,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to delete configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });

/**
 * Get cache statistics
 */
export const createCacheStatsTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_CONFIG_CACHE_STATS",
    description: "Get Discord configuration cache statistics",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        total: z.number(),
        valid: z.number(),
        expired: z.number(),
        ttl: z.number(),
      })
      .strict(),
    execute: async () => {
      return getCacheStats();
    },
  });

/**
 * Clear configuration cache
 */
export const createClearCacheTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_CONFIG_CLEAR_CACHE",
    description:
      "Clear Discord configuration cache. Forces reload from Supabase on next access.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
      })
      .strict(),
    execute: async () => {
      clearConfigCache();
      return {
        success: true,
        message: "Configuration cache cleared successfully",
      };
    },
  });

/**
 * Generate and save a persistent Mesh API Key
 *
 * This creates an API key that never expires and saves it to the config.
 * The bot will use this API key instead of session tokens, solving the
 * "session expired" problem.
 */
export const createGenerateApiKeyTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_GENERATE_API_KEY",
    description:
      "Generate a persistent Mesh API Key for this Discord bot. This solves the 'session expired' problem by creating a key that never expires. The bot will automatically use this key for LLM and other API calls.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        hasApiKey: z.boolean(),
        expiresAt: z.string().nullable(),
      })
      .strict(),
    execute: async () => {
      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        return {
          success: false,
          message: "Supabase not configured. Cannot save API key.",
          hasApiKey: false,
          expiresAt: null,
        };
      }

      // Get current connection context
      const connectionId =
        env.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";
      const organizationId = env.MESH_REQUEST_CONTEXT?.organizationId;
      const meshUrl = env.MESH_REQUEST_CONTEXT?.meshUrl;
      const token = env.MESH_REQUEST_CONTEXT?.token;

      if (!organizationId || !meshUrl || !token) {
        return {
          success: false,
          message:
            "Missing Mesh context. Please click 'Save' in the Mesh Dashboard first to establish a session.",
          hasApiKey: false,
          expiresAt: null,
        };
      }

      // Load existing config
      const existingConfig = await getDiscordConfig(connectionId);
      if (!existingConfig) {
        return {
          success: false,
          message:
            "No saved configuration found. Use DISCORD_SAVE_CONFIG first to save bot configuration.",
          hasApiKey: false,
          expiresAt: null,
        };
      }

      // Check if already has API key
      if (existingConfig.meshApiKey) {
        return {
          success: true,
          message:
            "API Key already exists for this connection. The bot is configured to use the persistent key.",
          hasApiKey: true,
          expiresAt: null, // API keys don't expire
        };
      }

      try {
        // Call Mesh Self MCP endpoint to create an API key
        // Uses the MCP JSONRPC protocol format at /mcp/self
        const createApiKeyUrl = `${meshUrl}/mcp/self`;

        const state = env.MESH_REQUEST_CONTEXT?.state as Record<
          string,
          unknown
        >;
        const modelProviderId = (state?.MODEL_PROVIDER as { value?: string })
          ?.value;

        // Build permissions - need access to Decopilot, model provider, and the current connection
        const permissions: Record<string, string[]> = {
          self: ["*"], // All management tools
        };

        // Add connection-specific permissions if model provider is configured
        if (modelProviderId) {
          permissions[modelProviderId] = ["*"];
        }

        // Add current connection permissions
        if (connectionId) {
          permissions[`conn_${connectionId}`] = ["*"];
        }

        // Use MCP JSONRPC format
        const mcpRequest = {
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "API_KEY_CREATE",
            arguments: {
              name: `Discord Bot - ${connectionId}`,
              permissions,
              // No expiresIn = never expires!
              metadata: {
                createdFor: "discord-mcp",
                connectionId,
              },
            },
          },
          id: Date.now(),
        };

        const response = await fetch(createApiKeyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          body: JSON.stringify(mcpRequest),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            "[GenerateApiKey] Failed to create API key:",
            errorText,
          );
          return {
            success: false,
            message: `Failed to create API key: ${response.status} ${errorText}`,
            hasApiKey: false,
            expiresAt: null,
          };
        }

        // Type for MCP JSONRPC response
        interface McpResponse {
          jsonrpc: string;
          id?: number;
          error?: { code: number; message: string };
          result?: {
            structuredContent?: { key?: string; [key: string]: unknown };
            content?: Array<{ type: string; text: string }>;
          };
        }

        const mcpResponse = (await response.json()) as McpResponse;
        console.log(
          "[GenerateApiKey] MCP Response:",
          JSON.stringify(mcpResponse, null, 2),
        );

        // MCP JSONRPC response format: { jsonrpc: "2.0", result: { structuredContent: {...} }, id: ... }
        // Or error format: { jsonrpc: "2.0", error: { code, message }, id: ... }
        if (mcpResponse.error) {
          return {
            success: false,
            message: `MCP Error: ${mcpResponse.error.message || JSON.stringify(mcpResponse.error)}`,
            hasApiKey: false,
            expiresAt: null,
          };
        }

        // The result can be in structuredContent or parsed from content text
        const resultData =
          mcpResponse.result?.structuredContent ||
          (mcpResponse.result?.content?.[0]?.text
            ? (JSON.parse(mcpResponse.result.content[0].text) as {
                key?: string;
              })
            : null);

        const apiKey = resultData?.key;

        if (!apiKey) {
          console.error("[GenerateApiKey] No key in response:", mcpResponse);
          return {
            success: false,
            message: `API key creation succeeded but no key was returned. Response: ${JSON.stringify(mcpResponse)}`,
            hasApiKey: false,
            expiresAt: null,
          };
        }

        // Save the API key to the config
        await setDiscordConfig({
          ...existingConfig,
          meshApiKey: apiKey,
        });

        console.log(
          `[GenerateApiKey] ✅ API Key created and saved for ${connectionId}`,
        );

        return {
          success: true,
          message:
            "API Key created and saved successfully! The bot will now use this persistent key for all API calls. Session expiration is no longer a problem.",
          hasApiKey: true,
          expiresAt: null, // Never expires
        };
      } catch (error) {
        console.error("[GenerateApiKey] Error:", error);
        return {
          success: false,
          message: `Error creating API key: ${error instanceof Error ? error.message : String(error)}`,
          hasApiKey: false,
          expiresAt: null,
        };
      }
    },
  });

// Export all config tools (v2 - fixed MCP endpoint)
export const configTools = [
  createSaveConfigTool,
  createLoadConfigTool,
  createDeleteConfigTool,
  createCacheStatsTool,
  createClearCacheTool,
  createGenerateApiKeyTool,
];
