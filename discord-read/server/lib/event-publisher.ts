/**
 * Discord Event Publisher
 *
 * Publishes Discord events via trigger callbacks for cross-MCP integration.
 * Other MCPs can subscribe to these events to react to Discord activity.
 */

import type { Env } from "../types/env.ts";
import type {
  Message,
  GuildMember,
  MessageReaction,
  User,
  ThreadChannel,
  AnyThreadChannel,
  GuildChannel,
  CategoryChannel,
} from "discord.js";
import { triggers } from "./trigger-store.ts";

/**
 * Publish a discord.message.created event
 */
export function publishMessageCreated(env: Env, message: Message): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.message.created", {
    event: "discord.message.created",
    subject: message.id,
    message_id: message.id,
    guild_id: message.guild?.id,
    guild_name: message.guild?.name,
    channel_id: message.channelId,
    channel_name:
      message.channel && "name" in message.channel
        ? message.channel.name
        : undefined,
    parent_id:
      message.channel && "parentId" in message.channel
        ? message.channel.parentId
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
  });
  console.log(`[Triggers] Notified discord.message.created: ${message.id}`);
}

/**
 * Publish a discord.message.deleted event
 */
export function publishMessageDeleted(env: Env, message: Message): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.message.deleted", {
    event: "discord.message.deleted",
    subject: message.id,
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
  });
  console.log(`[Triggers] Notified discord.message.deleted: ${message.id}`);
}

/**
 * Publish a discord.message.updated event
 */
export function publishMessageUpdated(
  env: Env,
  oldMessage: Message,
  newMessage: Message,
): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.message.updated", {
    event: "discord.message.updated",
    subject: newMessage.id,
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
  });
  console.log(`[Triggers] Notified discord.message.updated: ${newMessage.id}`);
}

/**
 * Publish a discord.member.joined event
 */
export function publishMemberJoined(env: Env, member: GuildMember): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.member.joined", {
    event: "discord.member.joined",
    subject: member.id,
    user_id: member.id,
    username: member.user.username,
    display_name: member.displayName,
    guild_id: member.guild.id,
    guild_name: member.guild.name,
    is_bot: member.user.bot,
    joined_at: member.joinedAt?.toISOString(),
    account_created_at: member.user.createdAt.toISOString(),
  });
  console.log(`[Triggers] Notified discord.member.joined: ${member.id}`);
}

/**
 * Publish a discord.member.left event
 */
export function publishMemberLeft(env: Env, member: GuildMember): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.member.left", {
    event: "discord.member.left",
    subject: member.id,
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
  });
  console.log(`[Triggers] Notified discord.member.left: ${member.id}`);
}

/**
 * Publish a discord.member.role.added event
 */
export function publishMemberRoleAdded(
  env: Env,
  member: GuildMember,
  roleId: string,
  roleName: string,
): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.member.role.added", {
    event: "discord.member.role.added",
    subject: member.id,
    user_id: member.id,
    username: member.user.username,
    guild_id: member.guild.id,
    guild_name: member.guild.name,
    role_id: roleId,
    role_name: roleName,
    added_at: new Date().toISOString(),
  });
  console.log(
    `[Triggers] Notified discord.member.role.added: ${member.id} got role ${roleName}`,
  );
}

/**
 * Publish a discord.member.role.removed event
 */
export function publishMemberRoleRemoved(
  env: Env,
  member: GuildMember,
  roleId: string,
  roleName: string,
): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.member.role.removed", {
    event: "discord.member.role.removed",
    subject: member.id,
    user_id: member.id,
    username: member.user.username,
    guild_id: member.guild.id,
    guild_name: member.guild.name,
    role_id: roleId,
    role_name: roleName,
    removed_at: new Date().toISOString(),
  });
  console.log(
    `[Triggers] Notified discord.member.role.removed: ${member.id} lost role ${roleName}`,
  );
}

/**
 * Publish a discord.reaction.added event
 */
export function publishReactionAdded(
  env: Env,
  reaction: MessageReaction,
  user: User,
): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  const emoji = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;

  triggers.notify(connectionId, "discord.reaction.added", {
    event: "discord.reaction.added",
    subject: reaction.message.id,
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
  });
  console.log(
    `[Triggers] Notified discord.reaction.added: ${emoji} on ${reaction.message.id}`,
  );
}

/**
 * Publish a discord.reaction.removed event
 */
export function publishReactionRemoved(
  env: Env,
  reaction: MessageReaction,
  user: User,
): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  const emoji = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;

  triggers.notify(connectionId, "discord.reaction.removed", {
    event: "discord.reaction.removed",
    subject: reaction.message.id,
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
  });
  console.log(
    `[Triggers] Notified discord.reaction.removed: ${emoji} from ${reaction.message.id}`,
  );
}

/**
 * Publish a discord.thread.created event
 */
export function publishThreadCreated(
  env: Env,
  thread: ThreadChannel | AnyThreadChannel,
): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.thread.created", {
    event: "discord.thread.created",
    subject: thread.id,
    thread_id: thread.id,
    thread_name: thread.name,
    guild_id: thread.guild?.id,
    guild_name: thread.guild?.name,
    channel_id: thread.parentId,
    channel_name: thread.parent?.name,
    owner_id: thread.ownerId,
    type: thread.type,
    archived: thread.archived,
    locked: thread.locked,
    message_count: thread.messageCount,
    member_count: thread.memberCount,
    created_at: thread.createdAt?.toISOString(),
  });
  console.log(
    `[Triggers] Notified discord.thread.created: ${thread.name} (${thread.id})`,
  );
}

/**
 * Publish a discord.thread.deleted event
 */
export function publishThreadDeleted(
  env: Env,
  thread: ThreadChannel | AnyThreadChannel,
): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.thread.deleted", {
    event: "discord.thread.deleted",
    subject: thread.id,
    thread_id: thread.id,
    thread_name: thread.name,
    guild_id: thread.guild?.id,
    guild_name: thread.guild?.name,
    channel_id: thread.parentId,
    deleted_at: new Date().toISOString(),
  });
  console.log(
    `[Triggers] Notified discord.thread.deleted: ${thread.name} (${thread.id})`,
  );
}

/**
 * Publish a discord.thread.updated event
 */
export function publishThreadUpdated(
  env: Env,
  oldThread: ThreadChannel | AnyThreadChannel,
  newThread: ThreadChannel | AnyThreadChannel,
): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.thread.updated", {
    event: "discord.thread.updated",
    subject: newThread.id,
    thread_id: newThread.id,
    thread_name: newThread.name,
    guild_id: newThread.guild?.id,
    guild_name: newThread.guild?.name,
    channel_id: newThread.parentId,
    old_name: oldThread.name,
    new_name: newThread.name,
    name_changed: oldThread.name !== newThread.name,
    old_archived: oldThread.archived,
    new_archived: newThread.archived,
    old_locked: oldThread.locked,
    new_locked: newThread.locked,
    updated_at: new Date().toISOString(),
  });
  console.log(
    `[Triggers] Notified discord.thread.updated: ${newThread.name} (${newThread.id})`,
  );
}

/**
 * Publish a discord.channel.created event
 */
export function publishChannelCreated(env: Env, channel: GuildChannel): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  const categoryName =
    "parent" in channel ? (channel.parent as CategoryChannel)?.name : undefined;

  triggers.notify(connectionId, "discord.channel.created", {
    event: "discord.channel.created",
    subject: channel.id,
    channel_id: channel.id,
    channel_name: channel.name,
    guild_id: channel.guild?.id,
    guild_name: channel.guild?.name,
    type: channel.type,
    parent_id: "parentId" in channel ? channel.parentId : undefined,
    category_name: categoryName,
    position: channel.position,
    created_at: channel.createdAt?.toISOString(),
  });
  console.log(
    `[Triggers] Notified discord.channel.created: ${channel.name} (${channel.id})`,
  );
}

/**
 * Publish a discord.channel.deleted event
 */
export function publishChannelDeleted(env: Env, channel: GuildChannel): void {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) return;

  triggers.notify(connectionId, "discord.channel.deleted", {
    event: "discord.channel.deleted",
    subject: channel.id,
    channel_id: channel.id,
    channel_name: channel.name,
    guild_id: channel.guild?.id,
    guild_name: channel.guild?.name,
    type: channel.type,
    deleted_at: new Date().toISOString(),
  });
  console.log(
    `[Triggers] Notified discord.channel.deleted: ${channel.name} (${channel.id})`,
  );
}
