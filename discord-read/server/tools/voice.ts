/**
 * Voice Tools
 *
 * MCP tools for managing voice channels.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import z from "zod";
import type { Env } from "../types/env.ts";
import { getDiscordClient } from "../discord/client.ts";

// ============================================================================
// Voice Channel Tools
// ============================================================================

/**
 * Join a voice channel
 */
export const createJoinVoiceChannelTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_JOIN_VOICE_CHANNEL",
    description: "Join a voice channel to listen and respond via TTS",
    inputSchema: z
      .object({
        channelId: z.string().describe("Voice channel ID to join"),
        guildId: z.string().describe("Guild ID where the channel is"),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { channelId: string; guildId: string };
      const { channelId, guildId } = input;

      const client = getDiscordClient();
      if (!client) {
        return {
          success: false,
          error: "Discord client not initialized",
        };
      }

      try {
        const { startVoiceSession, isVoiceEnabled, isWhisperConfigured } =
          await import("../voice/index.ts");

        if (!isVoiceEnabled()) {
          return {
            success: false,
            error:
              "Voice is not enabled. Configure VOICE_CONFIG.ENABLED in the MCP settings.",
          };
        }

        if (!isWhisperConfigured()) {
          return {
            success: false,
            error:
              "Whisper is not configured for voice transcription. Configure WHISPER binding.",
          };
        }

        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(channelId);

        if (!channel || !channel.isVoiceBased()) {
          return {
            success: false,
            error: "Channel not found or is not a voice channel",
          };
        }

        // Cast to VoiceChannel
        const voiceChannel = channel as import("discord.js").VoiceChannel;
        const success = await startVoiceSession(voiceChannel, guild);

        return {
          success,
          message: success
            ? `Joined voice channel: ${voiceChannel.name}`
            : "Failed to join voice channel",
        };
      } catch (error) {
        console.error("[Tool] DISCORD_JOIN_VOICE_CHANNEL error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Leave a voice channel
 */
export const createLeaveVoiceChannelTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_LEAVE_VOICE_CHANNEL",
    description: "Leave the current voice channel in a guild",
    inputSchema: z
      .object({
        guildId: z.string().describe("Guild ID to leave voice channel in"),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { guildId: string };
      const { guildId } = input;

      try {
        const { stopVoiceSession, hasActiveSession } = await import(
          "../voice/index.ts"
        );

        if (!hasActiveSession(guildId)) {
          return {
            success: false,
            error: "Not connected to any voice channel in this guild",
          };
        }

        const success = await stopVoiceSession(guildId);

        return {
          success,
          message: success
            ? "Left voice channel"
            : "Failed to leave voice channel",
        };
      } catch (error) {
        console.error("[Tool] DISCORD_LEAVE_VOICE_CHANNEL error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Get voice session status
 */
export const createVoiceStatusTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_VOICE_STATUS",
    description: "Get the current voice session status for a guild",
    inputSchema: z
      .object({
        guildId: z
          .string()
          .optional()
          .describe("Guild ID to check (optional, shows all if not provided)"),
      })
      .strict(),
    outputSchema: z.object({
      voiceEnabled: z.boolean(),
      whisperConfigured: z.boolean(),
      ttsEnabled: z.boolean(),
      session: z
        .object({
          guildId: z.string(),
          channelId: z.string(),
          startedAt: z.string(),
          lastActivity: z.string(),
        })
        .nullable()
        .optional(),
      activeSessions: z
        .array(
          z.object({
            guildId: z.string(),
            channelId: z.string(),
            startedAt: z.string(),
            lastActivity: z.string(),
          }),
        )
        .optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { guildId?: string };
      const { guildId } = input;

      try {
        const {
          getSessionInfo,
          getAllSessions,
          isVoiceEnabled,
          isWhisperConfigured,
          isTTSEnabled,
        } = await import("../voice/index.ts");

        if (guildId) {
          const session = getSessionInfo(guildId);
          return {
            voiceEnabled: isVoiceEnabled(),
            whisperConfigured: isWhisperConfigured(),
            ttsEnabled: isTTSEnabled(),
            session: session
              ? {
                  guildId: session.guildId,
                  channelId: session.channelId,
                  startedAt: session.startedAt.toISOString(),
                  lastActivity: session.lastActivity.toISOString(),
                }
              : null,
          };
        }

        const sessions = getAllSessions();
        return {
          voiceEnabled: isVoiceEnabled(),
          whisperConfigured: isWhisperConfigured(),
          ttsEnabled: isTTSEnabled(),
          activeSessions: sessions.map((s) => ({
            guildId: s.guildId,
            channelId: s.channelId,
            startedAt: s.startedAt.toISOString(),
            lastActivity: s.lastActivity.toISOString(),
          })),
        };
      } catch (error) {
        console.error("[Tool] DISCORD_VOICE_STATUS error:", error);
        return {
          voiceEnabled: false,
          whisperConfigured: false,
          ttsEnabled: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Speak text in voice channel (TTS)
 */
export const createSpeakInVoiceTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_SPEAK_IN_VOICE",
    description: "Speak text in the current voice channel using TTS",
    inputSchema: z
      .object({
        guildId: z.string().describe("Guild ID where to speak"),
        text: z.string().describe("Text to speak"),
        language: z
          .string()
          .optional()
          .describe("Language code (default: pt-BR)"),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as {
        guildId: string;
        text: string;
        language?: string;
      };
      const { guildId, text } = input;

      try {
        const { isTTSEnabled, hasActiveSession, getSessionInfo } = await import(
          "../voice/index.ts"
        );
        const { getDiscordClient } = await import("../discord/client.ts");

        if (!hasActiveSession(guildId)) {
          return {
            success: false,
            error: "Not connected to any voice channel in this guild",
          };
        }

        if (!isTTSEnabled()) {
          return {
            success: false,
            error: "TTS is disabled",
          };
        }

        // Get text channel from session for TTS
        const session = getSessionInfo(guildId);
        const client = getDiscordClient();

        if (!session?.textChannelId || !client) {
          return {
            success: false,
            error: "No text channel configured for TTS",
          };
        }

        // Send via Discord native TTS
        const channel = await client.channels.fetch(session.textChannelId);
        if (!channel || !("send" in channel)) {
          return {
            success: false,
            error: "Could not access text channel",
          };
        }

        // Truncate if too long
        const truncated =
          text.length > 1900 ? text.substring(0, 1900) + "..." : text;
        await (channel as { send: Function }).send({
          content: truncated,
          tts: true, // Discord native TTS!
        });

        return {
          success: true,
          message: "Speech sent via Discord TTS",
        };
      } catch (error) {
        console.error("[Tool] DISCORD_SPEAK_IN_VOICE error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

/**
 * Join user's voice channel
 */
export const createJoinUserVoiceTool = (_env: Env) =>
  createPrivateTool({
    id: "DISCORD_JOIN_USER_VOICE",
    description: "Join the same voice channel as a specific user",
    inputSchema: z
      .object({
        userId: z.string().describe("User ID to join"),
        guildId: z.string().describe("Guild ID where to look for the user"),
      })
      .strict(),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }: { context: unknown }) => {
      const input = context as { userId: string; guildId: string };
      const { userId, guildId } = input;

      const client = getDiscordClient();
      if (!client) {
        return {
          success: false,
          error: "Discord client not initialized",
        };
      }

      try {
        const { joinUserChannel, isVoiceEnabled, isWhisperConfigured } =
          await import("../voice/index.ts");

        if (!isVoiceEnabled()) {
          return {
            success: false,
            error: "Voice is not enabled",
          };
        }

        if (!isWhisperConfigured()) {
          return {
            success: false,
            error: "Whisper is not configured for voice transcription",
          };
        }

        const guild = await client.guilds.fetch(guildId);
        const user = await client.users.fetch(userId);

        const success = await joinUserChannel(user, guild);

        return {
          success,
          message: success
            ? `Joined ${user.username}'s voice channel`
            : `Could not join ${user.username}'s voice channel (user may not be in voice)`,
        };
      } catch (error) {
        console.error("[Tool] DISCORD_JOIN_USER_VOICE error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

// Export all voice tools
export const voiceTools = [
  createJoinVoiceChannelTool,
  createLeaveVoiceChannelTool,
  createVoiceStatusTool,
  createSpeakInVoiceTool,
  createJoinUserVoiceTool,
];
