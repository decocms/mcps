/**
 * Reaction Handler
 *
 * Handles message reaction events.
 */

import type {
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
} from "discord.js";
import {
  upsertReaction,
  deleteReaction,
  deleteAllReactions,
  getReactionUserIds,
} from "../../../shared/db.ts";
import { logger, HyperDXLogger } from "../../lib/logger.ts";

/**
 * Handle a reaction being added to a message.
 */
export async function handleReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  // Fetch partial reaction if needed
  if (reaction.partial) {
    try {
      reaction = await reaction.fetch();
    } catch (error) {
      console.error("[Reaction] Error fetching partial reaction:", error);
      return;
    }
  }

  // Fetch partial user if needed
  if (user.partial) {
    try {
      user = await user.fetch();
    } catch (error) {
      console.error("[Reaction] Error fetching partial user:", error);
      return;
    }
  }

  // Get existing user IDs and add new one
  const existingUserIds = await getReactionUserIds(
    reaction.message.id,
    reaction.emoji.id,
    reaction.emoji.name || "unknown",
  );

  const userIds = [...new Set([...existingUserIds, user.id])];

  await upsertReaction({
    message_id: reaction.message.id,
    emoji_id: reaction.emoji.id,
    emoji_name: reaction.emoji.name || "unknown",
    emoji_animated: reaction.emoji.animated || false,
    count: reaction.count || 1,
    count_burst: reaction.countDetails?.burst || 0,
    count_normal: reaction.countDetails?.normal || reaction.count || 1,
    user_ids: userIds,
  });

  const traceId = HyperDXLogger.generateTraceId();
  logger.debug("Reaction added", {
    trace_id: traceId,
    messageId: reaction.message.id,
    reactionEmoji: reaction.emoji.name || "unknown",
    userId: user.id,
    userName: user.username,
    count: reaction.count || 1,
  });
}

/**
 * Handle a reaction being removed from a message.
 */
export async function handleReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  // Fetch partial reaction if needed
  if (reaction.partial) {
    try {
      reaction = await reaction.fetch();
    } catch {
      // Reaction might be completely removed
      console.log("[Reaction] Reaction already removed, cleaning up");
      await deleteReaction(
        reaction.message.id,
        reaction.emoji.id,
        reaction.emoji.name || "unknown",
      );
      return;
    }
  }

  // Get existing user IDs and remove the user
  const existingUserIds = await getReactionUserIds(
    reaction.message.id,
    reaction.emoji.id,
    reaction.emoji.name || "unknown",
  );

  const userIds = existingUserIds.filter((id) => id !== user.id);

  if (reaction.count === 0 || userIds.length === 0) {
    // Remove reaction entirely
    await deleteReaction(
      reaction.message.id,
      reaction.emoji.id,
      reaction.emoji.name || "unknown",
    );
  } else {
    // Update with reduced count
    await upsertReaction({
      message_id: reaction.message.id,
      emoji_id: reaction.emoji.id,
      emoji_name: reaction.emoji.name || "unknown",
      emoji_animated: reaction.emoji.animated || false,
      count: reaction.count || 0,
      count_burst: reaction.countDetails?.burst || 0,
      count_normal: reaction.countDetails?.normal || reaction.count || 0,
      user_ids: userIds,
    });
  }

  console.log(
    `[Reaction] Removed ${reaction.emoji.name} from message ${reaction.message.id} by ${user.id}`,
  );
}

/**
 * Handle all reactions being removed from a message.
 */
export async function handleReactionRemoveAll(
  messageId: string,
): Promise<void> {
  await deleteAllReactions(messageId);
  console.log(`[Reaction] Removed all reactions from message ${messageId}`);
}

/**
 * Handle a specific emoji reaction being removed from a message entirely.
 */
export async function handleReactionRemoveEmoji(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<void> {
  await deleteReaction(
    reaction.message.id,
    reaction.emoji.id,
    reaction.emoji.name || "unknown",
  );

  console.log(
    `[Reaction] Removed all ${reaction.emoji.name} reactions from message ${reaction.message.id}`,
  );
}
