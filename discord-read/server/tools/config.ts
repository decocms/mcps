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

// Export all config tools
export const configTools = [
  createSaveConfigTool,
  createLoadConfigTool,
  createDeleteConfigTool,
  createCacheStatsTool,
  createClearCacheTool,
];
