/**
 * Discord Slash Commands Management Tools
 *
 * Tools for managing Discord Application Commands (slash commands).
 * Commands are stored in Supabase and registered with Discord API.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import { getSupabaseClient } from "../lib/supabase-client.ts";
import { getDiscordConfig } from "../lib/config-cache.ts";

/**
 * Slash Command Option Types
 */
const OptionTypeSchema = z.enum([
  "STRING", // 3
  "INTEGER", // 4
  "BOOLEAN", // 5
  "USER", // 6
  "CHANNEL", // 7
  "ROLE", // 8
  "MENTIONABLE", // 9
  "NUMBER", // 10
  "ATTACHMENT", // 11
]);

/**
 * Slash Command Option Schema
 */
const CommandOptionSchema = z.object({
  name: z.string().min(1).max(32).describe("Option name (lowercase)"),
  description: z.string().min(1).max(100).describe("Option description"),
  type: OptionTypeSchema.describe("Option type"),
  required: z.boolean().default(false).describe("Is this option required?"),
  choices: z
    .array(
      z.object({
        name: z.string().describe("Choice display name"),
        value: z.union([z.string(), z.number()]).describe("Choice value"),
      }),
    )
    .optional()
    .describe("Predefined choices for this option"),
});

/**
 * Register a slash command with Discord API
 */
async function registerCommandWithDiscord(params: {
  applicationId: string;
  botToken: string;
  guildId?: string;
  commandName: string;
  description: string;
  options?: any[];
}): Promise<{ success: boolean; commandId?: string; error?: string }> {
  const {
    applicationId,
    botToken,
    guildId,
    commandName,
    description,
    options,
  } = params;

  // Build Discord API URL (guild-specific or global)
  const baseUrl = `https://discord.com/api/v10/applications/${applicationId}`;
  const url = guildId
    ? `${baseUrl}/guilds/${guildId}/commands`
    : `${baseUrl}/commands`;

  // Convert option types to Discord API format
  const discordOptions = options?.map((opt) => ({
    name: opt.name,
    description: opt.description,
    type: getDiscordOptionType(opt.type),
    required: opt.required ?? false,
    choices: opt.choices,
  }));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${botToken}`,
      },
      body: JSON.stringify({
        name: commandName,
        description: description,
        options: discordOptions,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Discord API error: ${response.status} ${errorText}`,
      };
    }

    const result = (await response.json()) as { id: string };
    return {
      success: true,
      commandId: result.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Convert our option type to Discord API type number
 */
function getDiscordOptionType(type: string): number {
  const typeMap: Record<string, number> = {
    STRING: 3,
    INTEGER: 4,
    BOOLEAN: 5,
    USER: 6,
    CHANNEL: 7,
    ROLE: 8,
    MENTIONABLE: 9,
    NUMBER: 10,
    ATTACHMENT: 11,
  };
  return typeMap[type] ?? 3; // Default to STRING
}

/**
 * Delete a command from Discord API
 */
async function deleteCommandFromDiscord(params: {
  applicationId: string;
  botToken: string;
  commandId: string;
  guildId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { applicationId, botToken, commandId, guildId } = params;

  const baseUrl = `https://discord.com/api/v10/applications/${applicationId}`;
  const url = guildId
    ? `${baseUrl}/guilds/${guildId}/commands/${commandId}`
    : `${baseUrl}/commands/${commandId}`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Discord API error: ${response.status} ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// LIST SLASH COMMANDS
// ============================================================================

export const createListSlashCommandsTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_LIST_SLASH_COMMANDS",
    description:
      "List all registered slash commands for this Discord connection.",
    inputSchema: z
      .object({
        guildId: z
          .string()
          .optional()
          .describe("Filter by guild ID (omit for all commands)"),
        enabled: z
          .boolean()
          .optional()
          .describe("Filter by enabled status (omit for all)"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        commands: z.array(
          z.object({
            id: z.string(),
            commandName: z.string(),
            description: z.string(),
            commandId: z.string().nullable(),
            guildId: z.string().nullable(),
            enabled: z.boolean(),
            options: z.any().nullable(),
            createdAt: z.string(),
            updatedAt: z.string(),
          }),
        ),
        message: z.string().optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const { env, context } = params;
      const { guildId, enabled } = context as {
        guildId?: string;
        enabled?: boolean;
      };

      const connectionId =
        env?.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

      const client = getSupabaseClient();
      if (!client) {
        return {
          success: false,
          commands: [],
          message: "Supabase not configured",
        };
      }

      try {
        let query = client
          .from("discord_slash_commands")
          .select("*")
          .eq("connection_id", connectionId)
          .order("created_at", { ascending: false });

        if (guildId !== undefined) {
          query = query.eq("guild_id", guildId);
        }

        if (enabled !== undefined) {
          query = query.eq("enabled", enabled);
        }

        const { data, error } = await query;

        if (error) {
          return {
            success: false,
            commands: [],
            message: `Failed to fetch commands: ${error.message}`,
          };
        }

        const commands = (data || []).map((row: any) => ({
          id: row.id,
          commandName: row.command_name,
          description: row.description,
          commandId: row.command_id,
          guildId: row.guild_id,
          enabled: row.enabled,
          options: row.options,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        return {
          success: true,
          commands,
          message: `Found ${commands.length} command(s)`,
        };
      } catch (error) {
        return {
          success: false,
          commands: [],
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// ============================================================================
// CREATE SLASH COMMAND
// ============================================================================

export const createRegisterSlashCommandTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_REGISTER_SLASH_COMMAND",
    description:
      "Register a new slash command with Discord. The command will be saved to database and registered with Discord API.",
    inputSchema: z
      .object({
        commandName: z
          .string()
          .min(1)
          .max(32)
          .regex(/^[\w-]+$/)
          .describe(
            "Command name (lowercase, no spaces, 1-32 characters, alphanumeric + hyphens/underscores)",
          ),
        description: z
          .string()
          .min(1)
          .max(100)
          .describe("Command description (1-100 characters)"),
        options: z
          .array(CommandOptionSchema)
          .optional()
          .describe("Command options/parameters"),
        guildId: z
          .string()
          .optional()
          .describe(
            "Guild ID for guild-specific command (omit for global command)",
          ),
        enabled: z
          .boolean()
          .default(true)
          .describe("Enable command immediately after registration"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        commandId: z.string().optional(),
        discordCommandId: z.string().optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const { env, context } = params;
      const { commandName, description, options, guildId, enabled } =
        context as {
          commandName: string;
          description: string;
          options?: any[];
          guildId?: string;
          enabled?: boolean;
        };

      const connectionId =
        env?.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

      const client = getSupabaseClient();
      if (!client) {
        return {
          success: false,
          message: "Supabase not configured",
        };
      }

      // Get bot config to retrieve token and application ID
      const config = await getDiscordConfig(connectionId);
      if (!config) {
        return {
          success: false,
          message: "Connection not configured. Save config first.",
        };
      }

      // Extract application ID from bot token (format: Bot.APPLICATION_ID.xxx)
      const botToken = config.botToken;
      const applicationId = botToken.split(".")[0];

      try {
        // Register command with Discord API
        const discordResult = await registerCommandWithDiscord({
          applicationId,
          botToken,
          guildId,
          commandName,
          description,
          options,
        });

        if (!discordResult.success) {
          return {
            success: false,
            message: `Failed to register with Discord: ${discordResult.error}`,
          };
        }

        // Save to database
        const { data, error } = await client
          .from("discord_slash_commands")
          .insert({
            connection_id: connectionId,
            command_id: discordResult.commandId,
            command_name: commandName,
            description: description,
            options: options ? JSON.stringify(options) : null,
            guild_id: guildId || null,
            enabled: enabled ?? true,
          })
          .select()
          .single();

        if (error) {
          return {
            success: false,
            message: `Registered with Discord but failed to save to database: ${error.message}`,
            discordCommandId: discordResult.commandId,
          };
        }

        const scope = guildId ? `guild ${guildId}` : "global";
        return {
          success: true,
          message: `✅ Slash command /${commandName} registered successfully (${scope})`,
          commandId: data.id,
          discordCommandId: discordResult.commandId,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// ============================================================================
// DELETE SLASH COMMAND
// ============================================================================

export const createDeleteSlashCommandTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_DELETE_SLASH_COMMAND",
    description:
      "Delete a slash command from Discord and database. Use the command ID from DISCORD_LIST_SLASH_COMMANDS.",
    inputSchema: z
      .object({
        commandId: z
          .string()
          .describe("Command ID (from database, not Discord command ID)"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
      })
      .strict(),
    execute: async (params: any) => {
      const { env, context } = params;
      const { commandId } = context as { commandId: string };

      const connectionId =
        env?.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

      const client = getSupabaseClient();
      if (!client) {
        return {
          success: false,
          message: "Supabase not configured",
        };
      }

      try {
        // Get command details first
        const { data: command, error: fetchError } = await client
          .from("discord_slash_commands")
          .select("*")
          .eq("id", commandId)
          .eq("connection_id", connectionId)
          .single();

        if (fetchError || !command) {
          return {
            success: false,
            message: "Command not found or belongs to different connection",
          };
        }

        // Get bot config
        const config = await getDiscordConfig(connectionId);
        if (!config) {
          return {
            success: false,
            message: "Connection not configured",
          };
        }

        const botToken = config.botToken;
        const applicationId = botToken.split(".")[0];

        // Delete from Discord if command_id exists
        if (command.command_id) {
          const discordResult = await deleteCommandFromDiscord({
            applicationId,
            botToken,
            commandId: command.command_id,
            guildId: command.guild_id,
          });

          if (!discordResult.success) {
            console.warn(
              `Failed to delete from Discord: ${discordResult.error}`,
            );
          }
        }

        // Delete from database
        const { error: deleteError } = await client
          .from("discord_slash_commands")
          .delete()
          .eq("id", commandId)
          .eq("connection_id", connectionId);

        if (deleteError) {
          return {
            success: false,
            message: `Failed to delete from database: ${deleteError.message}`,
          };
        }

        return {
          success: true,
          message: `✅ Slash command /${command.command_name} deleted successfully`,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// ============================================================================
// ENABLE/DISABLE SLASH COMMAND
// ============================================================================

export const createToggleSlashCommandTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_TOGGLE_SLASH_COMMAND",
    description:
      "Enable or disable a slash command. Disabled commands are not deleted but won't be processed.",
    inputSchema: z
      .object({
        commandId: z.string().describe("Command ID (from database)"),
        enabled: z.boolean().describe("Enable (true) or disable (false)"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
      })
      .strict(),
    execute: async (params: any) => {
      const { env, context } = params;
      const { commandId, enabled } = context as {
        commandId: string;
        enabled: boolean;
      };

      const connectionId =
        env?.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

      const client = getSupabaseClient();
      if (!client) {
        return {
          success: false,
          message: "Supabase not configured",
        };
      }

      try {
        const { data, error } = await client
          .from("discord_slash_commands")
          .update({
            enabled: enabled,
            updated_at: new Date().toISOString(),
          })
          .eq("id", commandId)
          .eq("connection_id", connectionId)
          .select("command_name")
          .single();

        if (error || !data) {
          return {
            success: false,
            message: "Command not found or update failed",
          };
        }

        const status = enabled ? "enabled" : "disabled";
        return {
          success: true,
          message: `✅ Command /${data.command_name} ${status}`,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// Export all tools
export const slashCommandTools = [
  createListSlashCommandsTool,
  createRegisterSlashCommandTool,
  createDeleteSlashCommandTool,
  createToggleSlashCommandTool,
];
