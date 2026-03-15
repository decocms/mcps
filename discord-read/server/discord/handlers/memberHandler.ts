/**
 * Member Handlers
 *
 * Handles guild member events for indexing.
 */

import type { GuildMember, PartialGuildMember } from "discord.js";
import { logger, HyperDXLogger } from "../../lib/logger.ts";

/**
 * Build member data object for database upsert.
 * Shared across join/leave/update handlers.
 */
function buildMemberUpsertData(
  member: GuildMember | PartialGuildMember,
  overrides?: Record<string, unknown>,
) {
  return {
    guild_id: member.guild.id,
    user_id: member.id,
    username: member.user?.username,
    global_name: member.user?.globalName,
    avatar: member.user?.displayAvatarURL(),
    bot: member.user?.bot,
    nickname: member.nickname || null,
    display_avatar:
      "displayAvatarURL" in member ? member.displayAvatarURL() : null,
    roles: member.roles?.cache.map((r) => r.id) || null,
    permissions: member.permissions?.bitfield?.toString() || null,
    joined_at: member.joinedAt || null,
    is_member: true,
    timed_out_until: member.communicationDisabledUntil || null,
    ...overrides,
  };
}

// ============================================================================
// Member Join Handler
// ============================================================================

/**
 * Handle member joining a guild
 */
export async function handleMemberJoin(member: GuildMember): Promise<void> {
  const traceId = HyperDXLogger.generateTraceId();

  logger.info("Member joined", {
    trace_id: traceId,
    userId: member.id,
    userName: member.user.username,
    guildId: member.guild.id,
    guildName: member.guild.name,
    isBot: member.user.bot,
  });

  try {
    const db = await import("../../../shared/db.ts");
    await db.upsertMember(buildMemberUpsertData(member));
  } catch (error) {
    logger.error("Could not index member join", {
      trace_id: traceId,
      userId: member.id,
      guildId: member.guild.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Member Leave Handler
// ============================================================================

/**
 * Handle member leaving a guild (or kicked/banned)
 */
export async function handleMemberLeave(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  const traceId = HyperDXLogger.generateTraceId();

  logger.info("Member left", {
    trace_id: traceId,
    userId: member.id,
    userName: member.user?.username,
    guildId: member.guild.id,
    guildName: member.guild.name,
  });

  try {
    const db = await import("../../../shared/db.ts");

    if (member.user) {
      await db.upsertMember(
        buildMemberUpsertData(member, {
          is_member: false,
          left_at: new Date(),
        }),
      );
    } else {
      // Partial member - just mark as left
      await db.markMemberLeft(member.guild.id, member.id);
    }
  } catch (error) {
    logger.error("Could not index member leave", {
      trace_id: traceId,
      userId: member.id,
      guildId: member.guild.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Member Update Handler
// ============================================================================

/**
 * Handle member updates (roles, nickname, etc.)
 */
export async function handleMemberUpdate(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  if (!member.user) return;

  const traceId = HyperDXLogger.generateTraceId();

  logger.debug("Member updated", {
    trace_id: traceId,
    userId: member.id,
    userName: member.user.username,
    guildId: member.guild.id,
    guildName: member.guild.name,
  });

  try {
    const db = await import("../../../shared/db.ts");
    await db.upsertMember(buildMemberUpsertData(member));
  } catch (error) {
    logger.error("Could not index member update", {
      trace_id: traceId,
      userId: member.id,
      guildId: member.guild.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
