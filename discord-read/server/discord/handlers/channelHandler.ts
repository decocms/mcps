/**
 * Channel & Thread Handlers
 *
 * Handles channel and thread events for indexing.
 */

import type {
  ThreadChannel,
  GuildChannel,
  CategoryChannel,
  AnyThreadChannel,
} from "discord.js";

// ============================================================================
// Thread Handlers
// ============================================================================

/**
 * Handle thread creation
 */
export async function handleThreadCreate(
  thread: ThreadChannel | AnyThreadChannel,
): Promise<void> {
  if (!thread.guild) return;

  console.log(`[Thread] Created: ${thread.name} (${thread.id})`);

  try {
    const db = await import("../../../shared/db.ts");

    // Get parent channel name
    const parent = thread.parent;
    const categoryName =
      parent && "parent" in parent
        ? (parent.parent as CategoryChannel)?.name
        : null;

    await db.upsertChannel({
      id: thread.id,
      guild_id: thread.guild.id,
      name: thread.name,
      type: thread.type,
      position: null,
      parent_id: thread.parentId,
      category_name: categoryName || null,
      owner_id: thread.ownerId,
      message_count: thread.messageCount,
      member_count: thread.memberCount,
      topic: null,
      nsfw: false,
      rate_limit_per_user: thread.rateLimitPerUser,
      archived: thread.archived ?? undefined,
      archived_at: thread.archivedAt,
      auto_archive_duration: thread.autoArchiveDuration,
      locked: thread.locked ?? undefined,
      created_at: thread.createdAt,
    });
  } catch (error) {
    console.log(
      "[Thread] Could not index:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Handle thread deletion
 */
export async function handleThreadDelete(
  thread: ThreadChannel | AnyThreadChannel,
): Promise<void> {
  console.log(`[Thread] Deleted: ${thread.id}`);

  try {
    const db = await import("../../../shared/db.ts");
    await db.markChannelDeleted(thread.id);
  } catch (error) {
    console.log(
      "[Thread] Could not mark deleted:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Handle thread update (archive, unarchive, etc.)
 */
export async function handleThreadUpdate(
  thread: ThreadChannel | AnyThreadChannel,
): Promise<void> {
  if (!thread.guild) return;

  console.log(`[Thread] Updated: ${thread.name} (${thread.id})`);

  try {
    const db = await import("../../../shared/db.ts");

    const parent = thread.parent;
    const categoryName =
      parent && "parent" in parent
        ? (parent.parent as CategoryChannel)?.name
        : null;

    await db.upsertChannel({
      id: thread.id,
      guild_id: thread.guild.id,
      name: thread.name,
      type: thread.type,
      parent_id: thread.parentId,
      category_name: categoryName || null,
      owner_id: thread.ownerId,
      message_count: thread.messageCount,
      member_count: thread.memberCount,
      rate_limit_per_user: thread.rateLimitPerUser,
      archived: thread.archived ?? undefined,
      archived_at: thread.archivedAt,
      auto_archive_duration: thread.autoArchiveDuration,
      locked: thread.locked ?? undefined,
      created_at: thread.createdAt,
    });
  } catch (error) {
    console.log(
      "[Thread] Could not update:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

// ============================================================================
// Channel Handlers
// ============================================================================

/**
 * Handle channel creation
 */
export async function handleChannelCreate(
  channel: GuildChannel,
): Promise<void> {
  if (!channel.guild) return;

  console.log(`[Channel] Created: ${channel.name} (${channel.id})`);

  try {
    const db = await import("../../../shared/db.ts");

    // Get category name if exists
    const categoryName =
      "parent" in channel ? (channel.parent as CategoryChannel)?.name : null;

    await db.upsertChannel({
      id: channel.id,
      guild_id: channel.guild.id,
      name: channel.name,
      type: channel.type,
      position: channel.position,
      parent_id: "parentId" in channel ? channel.parentId : null,
      category_name: categoryName || null,
      topic: "topic" in channel ? (channel.topic as string | null) : null,
      nsfw: "nsfw" in channel ? (channel.nsfw as boolean) : false,
      rate_limit_per_user:
        "rateLimitPerUser" in channel
          ? (channel.rateLimitPerUser as number | null)
          : null,
      created_at: channel.createdAt,
    });
  } catch (error) {
    console.log(
      "[Channel] Could not index:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Handle channel deletion
 */
export async function handleChannelDelete(
  channel: GuildChannel | { id: string },
): Promise<void> {
  const channelId = channel.id;
  console.log(`[Channel] Deleted: ${channelId}`);

  try {
    const db = await import("../../../shared/db.ts");
    await db.markChannelDeleted(channelId);
  } catch (error) {
    console.log(
      "[Channel] Could not mark deleted:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
