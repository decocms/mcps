/**
 * Member Handlers
 *
 * Handles guild member events for indexing.
 */

import type { GuildMember, PartialGuildMember } from "discord.js";

// ============================================================================
// Member Join Handler
// ============================================================================

/**
 * Handle member joining a guild
 */
export async function handleMemberJoin(member: GuildMember): Promise<void> {
  console.log(
    `[Member] Joined: ${member.user.username} (${member.id}) in ${member.guild.name}`,
  );

  try {
    const db = await import("../../../shared/db.ts");

    await db.upsertMember({
      guild_id: member.guild.id,
      user_id: member.id,
      username: member.user.username,
      global_name: member.user.globalName,
      avatar: member.user.displayAvatarURL(),
      bot: member.user.bot,
      nickname: member.nickname,
      display_avatar: member.displayAvatarURL(),
      roles: member.roles.cache.map((r) => r.id),
      permissions: member.permissions?.bitfield?.toString(),
      joined_at: member.joinedAt,
      is_member: true,
      timed_out_until: member.communicationDisabledUntil,
    });
  } catch (error) {
    console.log(
      "[Member] Could not index join:",
      error instanceof Error ? error.message : String(error),
    );
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
  console.log(
    `[Member] Left: ${member.user?.username || member.id} in ${member.guild.name}`,
  );

  try {
    const db = await import("../../../shared/db.ts");

    // First update member info if we have it
    if (member.user) {
      await db.upsertMember({
        guild_id: member.guild.id,
        user_id: member.id,
        username: member.user.username,
        global_name: member.user.globalName,
        avatar: member.user.displayAvatarURL(),
        bot: member.user.bot,
        nickname: member.nickname || null,
        roles: member.roles?.cache.map((r) => r.id) || null,
        is_member: false,
        left_at: new Date(),
      });
    } else {
      // Partial member - just mark as left
      await db.markMemberLeft(member.guild.id, member.id);
    }
  } catch (error) {
    console.log(
      "[Member] Could not index leave:",
      error instanceof Error ? error.message : String(error),
    );
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

  console.log(
    `[Member] Updated: ${member.user.username} in ${member.guild.name}`,
  );

  try {
    const db = await import("../../../shared/db.ts");

    await db.upsertMember({
      guild_id: member.guild.id,
      user_id: member.id,
      username: member.user.username,
      global_name: member.user.globalName,
      avatar: member.user.displayAvatarURL(),
      bot: member.user.bot,
      nickname: member.nickname || null,
      display_avatar: member.displayAvatarURL(),
      roles: member.roles?.cache.map((r) => r.id) || null,
      permissions: member.permissions?.bitfield?.toString() || null,
      joined_at: member.joinedAt || null,
      is_member: true,
      timed_out_until: member.communicationDisabledUntil || null,
    });
  } catch (error) {
    console.log(
      "[Member] Could not index update:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
