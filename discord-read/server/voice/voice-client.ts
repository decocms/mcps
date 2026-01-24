/**
 * Voice Client Module
 *
 * Manages Discord voice channel connections.
 * Handles joining, leaving, and maintaining voice connections.
 */

import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  type VoiceConnection,
} from "@discordjs/voice";
import type { VoiceChannel, Guild, GuildMember } from "discord.js";

// ============================================================================
// Types
// ============================================================================

export interface VoiceConnectionInfo {
  guildId: string;
  channelId: string;
  connection: VoiceConnection;
  joinedAt: Date;
}

// ============================================================================
// State
// ============================================================================

// Track active voice connections per guild
const activeConnections = new Map<string, VoiceConnectionInfo>();

// ============================================================================
// Connection Management
// ============================================================================

/**
 * Join a voice channel
 */
export async function joinVoiceChannelSafe(
  channel: VoiceChannel,
  guild: Guild,
): Promise<VoiceConnection | null> {
  try {
    console.log(`[Voice] Joining channel: ${channel.name} (${channel.id})`);

    // Check if already connected to this channel
    const existing = activeConnections.get(guild.id);
    if (existing && existing.channelId === channel.id) {
      console.log("[Voice] Already connected to this channel");
      return existing.connection;
    }

    // If connected to a different channel, disconnect first
    if (existing) {
      console.log("[Voice] Disconnecting from previous channel...");
      existing.connection.destroy();
      activeConnections.delete(guild.id);
    }

    // Create new connection
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false, // IMPORTANT: false to HEAR users
      selfMute: false, // IMPORTANT: false to SPEAK (TTS)
    });

    // Wait for connection to be ready
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      console.log(`[Voice] ✅ Connected to: ${channel.name}`);
    } catch (error) {
      console.error("[Voice] Failed to connect:", error);
      connection.destroy();
      return null;
    }

    // Handle disconnection
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log("[Voice] Disconnected, attempting to reconnect...");

      try {
        // Try to reconnect
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Successfully reconnecting
      } catch {
        // Failed to reconnect, destroy connection
        console.log("[Voice] Failed to reconnect, destroying connection");
        connection.destroy();
        activeConnections.delete(guild.id);
      }
    });

    // Handle destruction
    connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log("[Voice] Connection destroyed");
      activeConnections.delete(guild.id);
    });

    // Store connection info
    activeConnections.set(guild.id, {
      guildId: guild.id,
      channelId: channel.id,
      connection,
      joinedAt: new Date(),
    });

    return connection;
  } catch (error) {
    console.error("[Voice] Error joining channel:", error);
    return null;
  }
}

/**
 * Leave a voice channel
 */
export function leaveVoiceChannel(guildId: string): boolean {
  const connectionInfo = activeConnections.get(guildId);

  if (!connectionInfo) {
    // Try to get connection directly
    const connection = getVoiceConnection(guildId);
    if (connection) {
      connection.destroy();
      return true;
    }
    console.log("[Voice] Not connected to any channel in this guild");
    return false;
  }

  console.log(`[Voice] Leaving channel in guild: ${guildId}`);
  connectionInfo.connection.destroy();
  activeConnections.delete(guildId);

  return true;
}

/**
 * Get active connection for a guild
 */
export function getActiveConnection(guildId: string): VoiceConnection | null {
  const info = activeConnections.get(guildId);
  return info?.connection ?? getVoiceConnection(guildId) ?? null;
}

/**
 * Get connection info for a guild
 */
export function getConnectionInfo(guildId: string): VoiceConnectionInfo | null {
  return activeConnections.get(guildId) ?? null;
}

/**
 * Check if connected to voice in a guild
 */
export function isConnectedToVoice(guildId: string): boolean {
  const info = activeConnections.get(guildId);
  if (info) return true;

  const connection = getVoiceConnection(guildId);
  return connection !== undefined;
}

/**
 * Get all active connections
 */
export function getAllConnections(): VoiceConnectionInfo[] {
  return Array.from(activeConnections.values());
}

/**
 * Disconnect from all voice channels
 */
export function disconnectAll(): void {
  console.log(
    `[Voice] Disconnecting from all channels (${activeConnections.size} connections)`,
  );

  for (const [guildId, info] of activeConnections) {
    try {
      info.connection.destroy();
    } catch (error) {
      console.error(
        `[Voice] Error disconnecting from guild ${guildId}:`,
        error,
      );
    }
  }

  activeConnections.clear();
}

/**
 * Get the voice channel a member is in
 */
export function getMemberVoiceChannel(
  member: GuildMember,
): VoiceChannel | null {
  const voiceState = member.voice;
  if (!voiceState?.channel) return null;

  // Check if it's a voice channel (not a stage channel)
  if (voiceState.channel.isVoiceBased()) {
    return voiceState.channel as VoiceChannel;
  }

  return null;
}

/**
 * Join the same voice channel as a member
 */
export async function joinMemberChannel(
  member: GuildMember,
): Promise<VoiceConnection | null> {
  const channel = getMemberVoiceChannel(member);
  if (!channel) {
    console.log(
      `[Voice] Member ${member.user.username} is not in a voice channel`,
    );
    return null;
  }

  return joinVoiceChannelSafe(channel, member.guild);
}
