/**
 * Discord Event Publisher
 *
 * Publishes Discord events to the Mesh EVENT_BUS for cross-MCP integration.
 * Other MCPs can subscribe to these events to react to Discord activity.
 */

import type { Env } from "../types/env.ts";
import type { Message, GuildMember, MessageReaction, User } from "discord.js";

/**
 * Publish a discord.message.created event
 */
export async function publishMessageCreated(
  env: Env,
  message: Message,
): Promise<void> {
  try {
    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
      type: "discord.message.created",
      subject: message.id,
      data: {
        message_id: message.id,
        guild_id: message.guild?.id,
        guild_name: message.guild?.name,
        channel_id: message.channelId,
        channel_name:
          message.channel && "name" in message.channel
            ? message.channel.name
            : undefined,
        author_id: message.author.id,
        author_username: message.author.username,
        author_bot: message.author.bot,
        content: message.content,
        has_attachments: message.attachments.size > 0,
        attachment_count: message.attachments.size,
        has_embeds: message.embeds.length > 0,
        is_dm: !message.guild,
        timestamp: message.createdAt.toISOString(),
        referenced_message_id: message.reference?.messageId,
      },
    });
    console.log(`[EventBus] Published discord.message.created: ${message.id}`);
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish message.created:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Publish a discord.message.deleted event
 */
export async function publishMessageDeleted(
  env: Env,
  message: Message,
): Promise<void> {
  try {
    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
      type: "discord.message.deleted",
      subject: message.id,
      data: {
        message_id: message.id,
        guild_id: message.guild?.id,
        guild_name: message.guild?.name,
        channel_id: message.channelId,
        channel_name:
          message.channel && "name" in message.channel
            ? message.channel.name
            : undefined,
        author_id: message.author?.id,
        author_username: message.author?.username,
        deleted_at: new Date().toISOString(),
      },
    });
    console.log(`[EventBus] Published discord.message.deleted: ${message.id}`);
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish message.deleted:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Publish a discord.message.updated event
 */
export async function publishMessageUpdated(
  env: Env,
  oldMessage: Message,
  newMessage: Message,
): Promise<void> {
  try {
    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
      type: "discord.message.updated",
      subject: newMessage.id,
      data: {
        message_id: newMessage.id,
        guild_id: newMessage.guild?.id,
        guild_name: newMessage.guild?.name,
        channel_id: newMessage.channelId,
        channel_name:
          newMessage.channel && "name" in newMessage.channel
            ? newMessage.channel.name
            : undefined,
        author_id: newMessage.author.id,
        author_username: newMessage.author.username,
        old_content: oldMessage.content,
        new_content: newMessage.content,
        content_changed: oldMessage.content !== newMessage.content,
        edited_at: newMessage.editedAt?.toISOString(),
      },
    });
    console.log(
      `[EventBus] Published discord.message.updated: ${newMessage.id}`,
    );
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish message.updated:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Publish a discord.member.joined event
 */
export async function publishMemberJoined(
  env: Env,
  member: GuildMember,
): Promise<void> {
  try {
    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
      type: "discord.member.joined",
      subject: member.id,
      data: {
        user_id: member.id,
        username: member.user.username,
        display_name: member.displayName,
        guild_id: member.guild.id,
        guild_name: member.guild.name,
        is_bot: member.user.bot,
        joined_at: member.joinedAt?.toISOString(),
        account_created_at: member.user.createdAt.toISOString(),
      },
    });
    console.log(`[EventBus] Published discord.member.joined: ${member.id}`);
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish member.joined:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Publish a discord.member.left event
 */
export async function publishMemberLeft(
  env: Env,
  member: GuildMember,
): Promise<void> {
  try {
    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
      type: "discord.member.left",
      subject: member.id,
      data: {
        user_id: member.id,
        username: member.user.username,
        display_name: member.displayName,
        guild_id: member.guild.id,
        guild_name: member.guild.name,
        left_at: new Date().toISOString(),
        roles: member.roles.cache.map((r) => ({
          id: r.id,
          name: r.name,
        })),
      },
    });
    console.log(`[EventBus] Published discord.member.left: ${member.id}`);
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish member.left:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Publish a discord.member.banned event
 */
export async function publishMemberBanned(
  env: Env,
  guildId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  try {
    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
      type: "discord.member.banned",
      subject: userId,
      data: {
        user_id: userId,
        guild_id: guildId,
        reason: reason || "No reason provided",
        banned_at: new Date().toISOString(),
      },
    });
    console.log(`[EventBus] Published discord.member.banned: ${userId}`);
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish member.banned:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Publish a discord.member.role.added event
 */
export async function publishMemberRoleAdded(
  env: Env,
  member: GuildMember,
  roleId: string,
  roleName: string,
): Promise<void> {
  try {
    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
      type: "discord.member.role.added",
      subject: member.id,
      data: {
        user_id: member.id,
        username: member.user.username,
        guild_id: member.guild.id,
        guild_name: member.guild.name,
        role_id: roleId,
        role_name: roleName,
        added_at: new Date().toISOString(),
      },
    });
    console.log(
      `[EventBus] Published discord.member.role.added: ${member.id} got role ${roleName}`,
    );
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish member.role.added:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Publish a discord.member.role.removed event
 */
export async function publishMemberRoleRemoved(
  env: Env,
  member: GuildMember,
  roleId: string,
  roleName: string,
): Promise<void> {
  try {
    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
      type: "discord.member.role.removed",
      subject: member.id,
      data: {
        user_id: member.id,
        username: member.user.username,
        guild_id: member.guild.id,
        guild_name: member.guild.name,
        role_id: roleId,
        role_name: roleName,
        removed_at: new Date().toISOString(),
      },
    });
    console.log(
      `[EventBus] Published discord.member.role.removed: ${member.id} lost role ${roleName}`,
    );
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish member.role.removed:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Publish a discord.reaction.added event
 */
export async function publishReactionAdded(
  env: Env,
  reaction: MessageReaction,
  user: User,
): Promise<void> {
  try {
    const emoji = reaction.emoji.id
      ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
      : reaction.emoji.name;

    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
      type: "discord.reaction.added",
      subject: reaction.message.id,
      data: {
        message_id: reaction.message.id,
        guild_id: reaction.message.guild?.id,
        guild_name: reaction.message.guild?.name,
        channel_id: reaction.message.channelId,
        user_id: user.id,
        username: user.username,
        emoji: emoji,
        emoji_id: reaction.emoji.id,
        emoji_name: reaction.emoji.name,
        added_at: new Date().toISOString(),
      },
    });
    console.log(
      `[EventBus] Published discord.reaction.added: ${emoji} on ${reaction.message.id}`,
    );
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish reaction.added:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Publish a discord.reaction.removed event
 */
export async function publishReactionRemoved(
  env: Env,
  reaction: MessageReaction,
  user: User,
): Promise<void> {
  try {
    const emoji = reaction.emoji.id
      ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
      : reaction.emoji.name;

    await env.MESH_REQUEST_CONTEXT?.state?.EVENT_BUS.EVENT_PUBLISH({
      type: "discord.reaction.removed",
      subject: reaction.message.id,
      data: {
        message_id: reaction.message.id,
        guild_id: reaction.message.guild?.id,
        guild_name: reaction.message.guild?.name,
        channel_id: reaction.message.channelId,
        user_id: user.id,
        username: user.username,
        emoji: emoji,
        emoji_id: reaction.emoji.id,
        emoji_name: reaction.emoji.name,
        removed_at: new Date().toISOString(),
      },
    });
    console.log(
      `[EventBus] Published discord.reaction.removed: ${emoji} from ${reaction.message.id}`,
    );
  } catch (error) {
    console.error(
      `[EventBus] Failed to publish reaction.removed:`,
      error instanceof Error ? error.message : error,
    );
  }
}
