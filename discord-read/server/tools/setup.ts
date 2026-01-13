/**
 * Setup Tools
 *
 * Tools for database setup, migration, and bot control.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";
import { runSQL } from "../db/postgres.ts";
import { discordQueries } from "../db/schemas/discord.ts";
import {
  guildsTableIdempotentQuery,
  guildsTableIndexesQuery,
} from "../../shared/db.ts";
import { getBotStatus, ensureBotRunning } from "../bot-manager.ts";

/**
 * Tool to initialize/migrate database tables.
 */
export const createSetupDatabaseTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_SETUP_DATABASE",
    description:
      "Create or update all Discord MCP database tables. Run this first before using other tools.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        tables: z.array(z.string()),
        error: z.string().optional(),
      })
      .strict(),
    execute: async () => {
      const results: string[] = [];

      try {
        // Create guilds table first (no foreign keys)
        console.log("[Setup] Creating guilds table...");
        await runSQL(env, guildsTableIdempotentQuery);
        await runSQL(env, guildsTableIndexesQuery);
        results.push("✓ guilds table created");

        // Create messages table
        console.log("[Setup] Creating discord_message table...");
        await runSQL(env, discordQueries.messages.idempotent);
        await runSQL(env, discordQueries.messages.indexes);
        results.push("✓ discord_message table created");

        // Create reactions table (depends on messages)
        console.log("[Setup] Creating discord_message_reaction table...");
        await runSQL(env, discordQueries.reactions.idempotent);
        await runSQL(env, discordQueries.reactions.indexes);
        results.push("✓ discord_message_reaction table created");

        // Create agent config table
        console.log("[Setup] Creating discord_agent_config table...");
        await runSQL(env, discordQueries.agentConfig.idempotent);
        await runSQL(env, discordQueries.agentConfig.indexes);
        results.push("✓ discord_agent_config table created");

        // Create agent permission table (depends on agent config)
        console.log("[Setup] Creating discord_agent_permission table...");
        await runSQL(env, discordQueries.agentPermission.idempotent);
        await runSQL(env, discordQueries.agentPermission.indexes);
        results.push("✓ discord_agent_permission table created");

        // Create command log table (depends on agent config)
        console.log("[Setup] Creating discord_command_log table...");
        await runSQL(env, discordQueries.commandLog.idempotent);
        await runSQL(env, discordQueries.commandLog.indexes);
        results.push("✓ discord_command_log table created");

        console.log("[Setup] All tables created successfully!");

        return {
          success: true,
          message: "Database setup complete!",
          tables: results,
        };
      } catch (error) {
        console.error("[Setup] Error:", error);
        return {
          success: false,
          message: "Database setup failed",
          error: error instanceof Error ? error.message : String(error),
          tables: results,
        };
      }
    },
  });

/**
 * Tool to check database status.
 */
export const createCheckDatabaseTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_CHECK_DATABASE",
    description: "Check if Discord MCP database tables exist.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        allTablesExist: z.boolean(),
        tables: z.record(z.string(), z.boolean()),
        message: z.string(),
        botStatus: z
          .object({
            running: z.boolean(),
            user: z.string().optional(),
          })
          .optional(),
      })
      .strict(),
    execute: async () => {
      // Just get status, don't auto-start (bot is started by onChange)
      const status = getBotStatus();

      const tables = [
        "guilds",
        "discord_message",
        "discord_message_reaction",
        "discord_agent_config",
        "discord_agent_permission",
        "discord_command_log",
      ];

      const results: Record<string, boolean> = {};

      for (const table of tables) {
        try {
          await runSQL(env, `SELECT 1 FROM ${table} LIMIT 1`);
          results[table] = true;
        } catch {
          results[table] = false;
        }
      }

      const allExist = Object.values(results).every((v) => v);

      return {
        success: true,
        allTablesExist: allExist,
        tables: results,
        message: allExist
          ? "All tables exist!"
          : "Some tables are missing. Run DISCORD_SETUP_DATABASE to create them.",
        botStatus: {
          running: status.running,
          user: status.user,
        },
      };
    },
  });

/**
 * Tool to start the Discord bot.
 */
export const createStartBotTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_START_BOT",
    description: "Start the Discord bot if not running.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        botUser: z.string().optional(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async () => {
      // Check if BOT_TOKEN is configured
      const botToken = env.MESH_REQUEST_CONTEXT?.state?.BOT_TOKEN;
      if (!botToken) {
        return {
          success: false,
          message:
            "BOT_TOKEN not configured. Please set it in the MCP configuration.",
        };
      }

      try {
        // Try to start the bot
        const started = await ensureBotRunning(env);
        const status = getBotStatus();

        if (started && status.running) {
          return {
            success: true,
            message: "Discord bot is running!",
            botUser: status.user,
          };
        }

        return {
          success: false,
          message: status.initializing
            ? "Bot is still initializing, please wait..."
            : "Failed to start bot. Check server logs.",
        };
      } catch (error) {
        return {
          success: false,
          message: "Failed to start bot",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Tool to check bot status.
 */
export const createBotStatusTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_BOT_STATUS",
    description: "Check the status of the Discord bot.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        running: z.boolean(),
        initializing: z.boolean().optional(),
        botUser: z.string().optional(),
        guilds: z.number().optional(),
        uptime: z.number().optional(),
      })
      .strict(),
    execute: async () => {
      // Just get status, don't auto-start
      const status = getBotStatus();

      return {
        running: status.running,
        initializing: status.initializing,
        botUser: status.user,
        guilds: status.guilds,
        uptime: status.uptime,
      };
    },
  });

/**
 * Tool to show database schema - helps the agent know table names
 */
export const createShowSchemaTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_SHOW_SCHEMA",
    description:
      "Show the database schema with table names and columns. Use this to know the correct table names before running SQL queries.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        tables: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            columns: z.array(z.string()),
            example_query: z.string(),
          }),
        ),
      })
      .strict(),
    execute: async () => {
      return {
        success: true,
        tables: [
          {
            name: "discord_message",
            description: "Mensagens indexadas do Discord",
            columns: [
              "id",
              "guild_id",
              "channel_id",
              "author_id",
              "author_username",
              "content",
              "created_at",
            ],
            example_query:
              "SELECT id, author_username, content, created_at FROM discord_message ORDER BY created_at DESC LIMIT 10",
          },
          {
            name: "guilds",
            description: "Servidores Discord",
            columns: ["id", "name", "icon", "owner_id"],
            example_query: "SELECT * FROM guilds",
          },
          {
            name: "discord_message_reaction",
            description: "Reações às mensagens",
            columns: ["id", "message_id", "user_id", "emoji", "created_at"],
            example_query:
              "SELECT * FROM discord_message_reaction WHERE message_id = '...'",
          },
          {
            name: "discord_agent_config",
            description: "Configurações de agentes AI",
            columns: ["id", "guild_id", "command", "name", "enabled"],
            example_query:
              "SELECT * FROM discord_agent_config WHERE guild_id = '...'",
          },
          {
            name: "discord_command_log",
            description: "Logs de comandos executados",
            columns: [
              "id",
              "guild_id",
              "user_id",
              "command",
              "raw_input",
              "response",
              "created_at",
            ],
            example_query:
              "SELECT * FROM discord_command_log ORDER BY created_at DESC LIMIT 10",
          },
        ],
      };
    },
  });

export const setupTools = [
  createSetupDatabaseTool,
  createCheckDatabaseTool,
  createStartBotTool,
  createBotStatusTool,
  createShowSchemaTool,
];
