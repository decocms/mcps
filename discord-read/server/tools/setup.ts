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
import { getBotStatus, ensureBotRunning, shutdownBot } from "../bot-manager.ts";
import {
  startBackfill,
  type BackfillResult,
} from "../services/backfill-service.ts";

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

        // Run migrations for existing tables (add new columns)
        console.log("[Setup] Running migrations...");
        await runSQL(env, discordQueries.messages.migration);
        results.push("✓ discord_message migrations applied");

        // Run migration indexes (for new columns)
        console.log("[Setup] Creating migration indexes...");
        const migrationIndexStatements =
          discordQueries.messages.migrationIndexes
            .split(";")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        for (const statement of migrationIndexStatements) {
          await runSQL(env, statement);
        }
        results.push("✓ migration indexes created");

        // Create channels table
        console.log("[Setup] Creating discord_channel table...");
        await runSQL(env, discordQueries.channels.idempotent);
        await runSQL(env, discordQueries.channels.indexes);
        results.push("✓ discord_channel table created");

        // Create members table
        console.log("[Setup] Creating discord_member table...");
        await runSQL(env, discordQueries.members.idempotent);
        await runSQL(env, discordQueries.members.indexes);
        results.push("✓ discord_member table created");

        // Create voice states table
        console.log("[Setup] Creating discord_voice_state table...");
        await runSQL(env, discordQueries.voiceStates.idempotent);
        await runSQL(env, discordQueries.voiceStates.indexes);
        results.push("✓ discord_voice_state table created");

        // Create audit log table
        console.log("[Setup] Creating discord_audit_log table...");
        await runSQL(env, discordQueries.auditLog.idempotent);
        await runSQL(env, discordQueries.auditLog.indexes);
        results.push("✓ discord_audit_log table created");

        // Create reactions table (depends on messages)
        console.log("[Setup] Creating discord_message_reaction table...");
        await runSQL(env, discordQueries.reactions.idempotent);
        await runSQL(env, discordQueries.reactions.indexes);
        results.push("✓ discord_message_reaction table created");

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
      // Check if Bot Token is configured in Authorization
      const hasAuth = !!env.MESH_REQUEST_CONTEXT?.authorization;
      if (!hasAuth) {
        return {
          success: false,
          message:
            "Discord Bot Token not configured. Please add it in the Authorization section of the Mesh Dashboard.",
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
export const createBotStatusTool = () =>
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
export const createShowSchemaTool = () =>
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

/**
 * Tool to shutdown the Discord bot.
 */
export const createShutdownBotTool = () =>
  createPrivateTool({
    id: "DISCORD_SHUTDOWN_BOT",
    description:
      "Shutdown the Discord bot completely. Stops all instances, disconnects from Discord, and stops the session heartbeat. Use this for maintenance or to force a restart.",
    inputSchema: z
      .object({
        confirm: z
          .boolean()
          .describe(
            "Must be true to confirm shutdown. This prevents accidental shutdowns.",
          ),
        reason: z
          .string()
          .optional()
          .describe("Optional reason for shutdown (for logging)"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        wasRunning: z.boolean(),
      })
      .strict(),
    execute: async ({ confirm, reason }) => {
      if (!confirm) {
        return {
          success: false,
          message:
            "Shutdown not confirmed. Set confirm=true to shutdown the bot.",
          wasRunning: false,
        };
      }

      const status = getBotStatus();
      const wasRunning = status.running;

      if (!wasRunning) {
        return {
          success: true,
          message: "Bot was not running.",
          wasRunning: false,
        };
      }

      try {
        console.log(
          `[Shutdown] Shutting down bot...${reason ? ` Reason: ${reason}` : ""}`,
        );

        await shutdownBot();

        console.log("[Shutdown] Bot shutdown complete ✓");

        return {
          success: true,
          message: `Bot shutdown successfully.${reason ? ` Reason: ${reason}` : ""} Use DISCORD_START_BOT to restart.`,
          wasRunning: true,
        };
      } catch (error) {
        console.error("[Shutdown] Error during shutdown:", error);
        return {
          success: false,
          message: `Shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
          wasRunning,
        };
      }
    },
  });

/**
 * Tool to restart the Discord bot.
 */
export const createRestartBotTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_RESTART_BOT",
    description:
      "Restart the Discord bot. Performs a full shutdown and then starts the bot again. Useful for applying configuration changes or recovering from errors.",
    inputSchema: z
      .object({
        reason: z
          .string()
          .optional()
          .describe("Optional reason for restart (for logging)"),
      })
      .strict(),
    outputSchema: z
      .object({
        success: z.boolean(),
        message: z.string(),
        botUser: z.string().optional(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ reason }) => {
      const reasonText = reason ? ` Reason: ${reason}` : "";
      console.log(`[Restart] Restarting bot...${reasonText}`);

      try {
        // Step 1: Shutdown
        const status = getBotStatus();
        if (status.running) {
          console.log("[Restart] Shutting down current instance...");
          await shutdownBot();
          // Wait a moment for cleanup
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Step 2: Start
        console.log("[Restart] Starting new instance...");
        const started = await ensureBotRunning(env);
        const newStatus = getBotStatus();

        if (started && newStatus.running) {
          console.log("[Restart] Bot restarted successfully ✓");
          return {
            success: true,
            message: `Bot restarted successfully.${reasonText}`,
            botUser: newStatus.user,
          };
        }

        return {
          success: false,
          message: newStatus.initializing
            ? "Bot is still initializing after restart..."
            : "Failed to restart bot. Check server logs.",
        };
      } catch (error) {
        console.error("[Restart] Error during restart:", error);
        return {
          success: false,
          message: "Restart failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Tool to start message backfill from Discord channels.
 * Syncs historical messages to database.
 */
export const createBackfillTool = (env: Env) =>
  createPrivateTool({
    id: "DISCORD_BACKFILL_START",
    description:
      "Start syncing historical messages from Discord to the database. " +
      "Only syncs channels visible to ALLOWED_ROLES. Runs asynchronously and " +
      "sends progress updates to LOG_CHANNEL_ID. Incremental - skips already synced messages.",
    inputSchema: z
      .object({
        guild_id: z.string().describe("The guild/server ID to sync"),
        channel_ids: z
          .array(z.string())
          .optional()
          .describe(
            "Optional: specific channel IDs to sync (default: all text channels)",
          ),
      })
      .strict(),
    outputSchema: z
      .object({
        started: z.boolean(),
        message: z.string(),
        guildId: z.string().optional(),
        channelsToSync: z.number().optional(),
        error: z.string().optional(),
      })
      .strict(),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guild_id: string;
        channel_ids?: string[];
      };

      // Check if bot is running
      const status = getBotStatus();
      if (!status.running) {
        return {
          started: false,
          message:
            "Bot is not running. Start the bot first with DISCORD_START_BOT.",
        };
      }

      console.log(`[Backfill] Tool called for guild ${input.guild_id}`);

      // Start backfill asynchronously
      // This returns immediately while the backfill runs in background
      const backfillPromise = startBackfill(
        env,
        input.guild_id,
        input.channel_ids,
      );

      // For async operation, we fire and forget but handle the result logging
      backfillPromise
        .then((result: BackfillResult) => {
          console.log(
            `[Backfill] Completed for ${result.guildId}: ${result.totalMessages} messages from ${result.channelsProcessed} channels`,
          );
        })
        .catch((error) => {
          console.error(
            `[Backfill] Failed:`,
            error instanceof Error ? error.message : String(error),
          );
        });

      // Return immediately
      return {
        started: true,
        message:
          "Backfill started! Progress will be sent to LOG_CHANNEL_ID. " +
          "Use DISCORD_BACKFILL_STATUS to check progress.",
        guildId: input.guild_id,
      };
    },
  });

/**
 * Global state to track backfill progress
 */
let currentBackfillStatus: {
  running: boolean;
  guildId?: string;
  startedAt?: Date;
  channelsProcessed?: number;
  totalChannels?: number;
  totalMessages?: number;
} = { running: false };

/**
 * Tool to check backfill status.
 */
export const createBackfillStatusTool = () =>
  createPrivateTool({
    id: "DISCORD_BACKFILL_STATUS",
    description: "Check the status of an ongoing message backfill operation.",
    inputSchema: z.object({}).strict(),
    outputSchema: z
      .object({
        running: z.boolean(),
        guildId: z.string().optional(),
        startedAt: z.string().optional(),
        channelsProcessed: z.number().optional(),
        totalChannels: z.number().optional(),
        totalMessages: z.number().optional(),
        elapsedTime: z.string().optional(),
      })
      .strict(),
    execute: async () => {
      if (!currentBackfillStatus.running) {
        return {
          running: false,
        };
      }

      const elapsed = currentBackfillStatus.startedAt
        ? Date.now() - currentBackfillStatus.startedAt.getTime()
        : 0;

      return {
        running: currentBackfillStatus.running,
        guildId: currentBackfillStatus.guildId,
        startedAt: currentBackfillStatus.startedAt?.toISOString(),
        channelsProcessed: currentBackfillStatus.channelsProcessed,
        totalChannels: currentBackfillStatus.totalChannels,
        totalMessages: currentBackfillStatus.totalMessages,
        elapsedTime: `${Math.floor(elapsed / 1000)}s`,
      };
    },
  });

export const setupTools = [
  createSetupDatabaseTool,
  createCheckDatabaseTool,
  createStartBotTool,
  createBotStatusTool,
  createShowSchemaTool,
  createShutdownBotTool,
  createRestartBotTool,
  createBackfillTool,
  createBackfillStatusTool,
];
