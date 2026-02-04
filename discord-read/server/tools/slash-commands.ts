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
 * Fetch commands from Discord API
 */
async function fetchCommandsFromDiscord(params: {
  applicationId: string;
  botToken: string;
  guildId?: string;
}): Promise<{
  success: boolean;
  commands?: Array<{
    id: string;
    name: string;
    description: string;
    options?: any[];
    guild_id?: string;
  }>;
  error?: string;
}> {
  const { applicationId, botToken, guildId } = params;

  const baseUrl = `https://discord.com/api/v10/applications/${applicationId}`;
  const url = guildId
    ? `${baseUrl}/guilds/${guildId}/commands`
    : `${baseUrl}/commands`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Discord API error: ${response.status} ${errorText}`,
      };
    }

    const commands = (await response.json()) as Array<{
      id: string;
      name: string;
      description: string;
      options?: any[];
      guild_id?: string;
    }>;

    return {
      success: true,
      commands,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
      "List slash commands from database, Discord API, or both. Use 'source' parameter to choose.",
    inputSchema: z
      .object({
        source: z
          .enum(["database", "discord", "both"])
          .default("database")
          .describe(
            "Source to list from: 'database' (local DB), 'discord' (Discord API), or 'both' (shows sync status)",
          ),
        guildId: z
          .string()
          .optional()
          .describe("Filter by guild ID (omit for global commands)"),
        enabled: z
          .boolean()
          .optional()
          .describe("Filter by enabled status (database only)"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        commands: z.array(
          z.object({
            id: z.string().optional(),
            commandName: z.string(),
            description: z.string(),
            commandId: z.string().nullable().optional(),
            guildId: z.string().nullable().optional(),
            enabled: z.boolean().optional(),
            options: z.any().nullable().optional(),
            createdAt: z.string().optional(),
            updatedAt: z.string().optional(),
            source: z.string().optional(),
            inDatabase: z.boolean().optional(),
            inDiscord: z.boolean().optional(),
          }),
        ),
        message: z.string().optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const { env, context } = params;
      const {
        source = "database",
        guildId,
        enabled,
      } = context as {
        source?: "database" | "discord" | "both";
        guildId?: string;
        enabled?: boolean;
      };

      const connectionId =
        env?.MESH_REQUEST_CONTEXT?.connectionId || "default-connection";

      const client = getSupabaseClient();

      // Get bot config for Discord API access
      const config = await getDiscordConfig(connectionId);

      try {
        // Fetch from database
        if (source === "database" || source === "both") {
          if (!client) {
            return {
              success: false,
              commands: [],
              message: "Supabase not configured",
            };
          }

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
              message: `Failed to fetch from database: ${error.message}`,
            };
          }

          if (source === "database") {
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
              source: "database",
            }));

            return {
              success: true,
              commands,
              message: `Found ${commands.length} command(s) in database`,
            };
          }

          // If source === "both", continue to fetch from Discord
          const dbCommands = data || [];

          if (!config) {
            return {
              success: false,
              commands: [],
              message: "Connection not configured for Discord API access",
            };
          }

          const botToken = config.botToken;
          const applicationId = botToken.split(".")[0];

          // Fetch from Discord
          const discordResult = await fetchCommandsFromDiscord({
            applicationId,
            botToken,
            guildId,
          });

          if (!discordResult.success) {
            return {
              success: false,
              commands: [],
              message: `Failed to fetch from Discord: ${discordResult.error}`,
            };
          }

          const discordCommands = discordResult.commands || [];

          // Merge and compare
          const commandMap = new Map<string, any>();

          // Add database commands
          for (const row of dbCommands) {
            const key = `${row.command_name}-${row.guild_id || "global"}`;
            commandMap.set(key, {
              id: row.id,
              commandName: row.command_name,
              description: row.description,
              commandId: row.command_id,
              guildId: row.guild_id,
              enabled: row.enabled,
              options: row.options,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              inDatabase: true,
              inDiscord: false,
            });
          }

          // Check Discord commands
          for (const cmd of discordCommands) {
            const key = `${cmd.name}-${cmd.guild_id || "global"}`;
            const existing = commandMap.get(key);

            if (existing) {
              existing.inDiscord = true;
            } else {
              commandMap.set(key, {
                commandName: cmd.name,
                description: cmd.description,
                commandId: cmd.id,
                guildId: cmd.guild_id || null,
                options: cmd.options || null,
                inDatabase: false,
                inDiscord: true,
                source: "discord-only",
              });
            }
          }

          const commands = Array.from(commandMap.values());

          return {
            success: true,
            commands,
            message: `Found ${commands.length} command(s). Database: ${dbCommands.length}, Discord: ${discordCommands.length}`,
          };
        }

        // Fetch from Discord only
        if (source === "discord") {
          if (!config) {
            return {
              success: false,
              commands: [],
              message: "Connection not configured",
            };
          }

          const botToken = config.botToken;
          const applicationId = botToken.split(".")[0];

          const discordResult = await fetchCommandsFromDiscord({
            applicationId,
            botToken,
            guildId,
          });

          if (!discordResult.success) {
            return {
              success: false,
              commands: [],
              message: `Failed to fetch from Discord: ${discordResult.error}`,
            };
          }

          const commands = (discordResult.commands || []).map((cmd) => ({
            commandName: cmd.name,
            description: cmd.description,
            commandId: cmd.id,
            guildId: cmd.guild_id || null,
            options: cmd.options || null,
            source: "discord",
          }));

          return {
            success: true,
            commands,
            message: `Found ${commands.length} command(s) in Discord`,
          };
        }

        return {
          success: false,
          commands: [],
          message: "Invalid source parameter",
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

// ============================================================================
// SYNC SLASH COMMANDS
// ============================================================================

export const createSyncSlashCommandsTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_SYNC_SLASH_COMMANDS",
    description:
      "Sync slash commands between Discord API and database. Can import missing commands from Discord to DB, or clean orphaned commands from DB.",
    inputSchema: z
      .object({
        action: z
          .enum(["import", "clean", "full-sync"])
          .describe(
            "'import' (add Discord commands to DB), 'clean' (remove DB commands not in Discord), 'full-sync' (both)",
          ),
        guildId: z
          .string()
          .optional()
          .describe("Guild ID to sync (omit for global commands)"),
        dryRun: z
          .boolean()
          .default(false)
          .describe("Preview changes without applying them"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        imported: z.number().optional(),
        cleaned: z.number().optional(),
        changes: z
          .array(
            z.object({
              action: z.string(),
              commandName: z.string(),
              commandId: z.string().optional(),
            }),
          )
          .optional(),
      })
      .strict(),
    execute: async (params: any) => {
      const { env, context } = params;
      const {
        action,
        guildId,
        dryRun = false,
      } = context as {
        action: "import" | "clean" | "full-sync";
        guildId?: string;
        dryRun?: boolean;
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

      const config = await getDiscordConfig(connectionId);
      if (!config) {
        return {
          success: false,
          message: "Connection not configured",
        };
      }

      try {
        const botToken = config.botToken;
        const applicationId = botToken.split(".")[0];

        // Fetch from Discord
        const discordResult = await fetchCommandsFromDiscord({
          applicationId,
          botToken,
          guildId,
        });

        if (!discordResult.success) {
          return {
            success: false,
            message: `Failed to fetch from Discord: ${discordResult.error}`,
          };
        }

        const discordCommands = discordResult.commands || [];

        // Fetch from database
        let query = client
          .from("discord_slash_commands")
          .select("*")
          .eq("connection_id", connectionId);

        if (guildId !== undefined) {
          query = query.eq("guild_id", guildId);
        }

        const { data: dbCommands, error } = await query;

        if (error) {
          return {
            success: false,
            message: `Failed to fetch from database: ${error.message}`,
          };
        }

        const dbCommandsMap = new Map(
          (dbCommands || []).map((cmd: any) => [
            `${cmd.command_name}-${cmd.guild_id || "global"}`,
            cmd,
          ]),
        );

        const discordCommandsMap = new Map(
          discordCommands.map((cmd) => [
            `${cmd.name}-${cmd.guild_id || "global"}`,
            cmd,
          ]),
        );

        const changes: Array<{
          action: string;
          commandName: string;
          commandId?: string;
        }> = [];
        let imported = 0;
        let cleaned = 0;

        // Import missing commands from Discord to DB
        if (action === "import" || action === "full-sync") {
          for (const [key, discordCmd] of discordCommandsMap) {
            if (!dbCommandsMap.has(key)) {
              changes.push({
                action: "import",
                commandName: discordCmd.name,
                commandId: discordCmd.id,
              });

              if (!dryRun) {
                await client.from("discord_slash_commands").insert({
                  connection_id: connectionId,
                  command_id: discordCmd.id,
                  command_name: discordCmd.name,
                  description: discordCmd.description,
                  options: discordCmd.options
                    ? JSON.stringify(discordCmd.options)
                    : null,
                  guild_id: discordCmd.guild_id || null,
                  enabled: true,
                });
                imported++;
              }
            }
          }
        }

        // Clean orphaned commands from DB
        if (action === "clean" || action === "full-sync") {
          for (const [key, dbCmd] of dbCommandsMap) {
            if (!discordCommandsMap.has(key)) {
              changes.push({
                action: "clean",
                commandName: dbCmd.command_name,
                commandId: dbCmd.id,
              });

              if (!dryRun) {
                await client
                  .from("discord_slash_commands")
                  .delete()
                  .eq("id", dbCmd.id);
                cleaned++;
              }
            }
          }
        }

        const prefix = dryRun ? "[DRY RUN] " : "";
        let message = `${prefix}Sync completed. `;

        if (action === "import" || action === "full-sync") {
          message += `Imported: ${dryRun ? changes.filter((c) => c.action === "import").length : imported}. `;
        }

        if (action === "clean" || action === "full-sync") {
          message += `Cleaned: ${dryRun ? changes.filter((c) => c.action === "clean").length : cleaned}.`;
        }

        return {
          success: true,
          message,
          imported: dryRun
            ? changes.filter((c) => c.action === "import").length
            : imported,
          cleaned: dryRun
            ? changes.filter((c) => c.action === "clean").length
            : cleaned,
          changes: changes.length > 0 ? changes : undefined,
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
  createSyncSlashCommandsTool,
];
