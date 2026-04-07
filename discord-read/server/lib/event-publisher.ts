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
import { getAllInstances } from "../bot-instance.ts";

/**
 * Notify a trigger event for all connections whose bot is in the same guild.
 * Only notifies connections that have an active client with access to the guild
 * where the event originated. DM events (no guildId) are scoped to only the
 * originating connection to prevent leaking private content across tenants.
 */
function notifyAllConnections(
  type: Parameters<(typeof triggers)["notify"]>[1],
  data: Record<string, unknown>,
  sourceConnectionId?: string,
): void {
  const instances = getAllInstances();
  const guildId = data.guild_id as string | undefined;

  for (const instance of instances) {
    // Skip connections without an active bot
    if (!instance.client?.isReady()) continue;

    if (guildId) {
      // Guild event: only notify bots that are in that guild
      if (!instance.client.guilds.cache.has(guildId)) continue;
    } else {
      // DM event: only notify the originating connection (no cross-tenant leak)
      if (sourceConnectionId && instance.connectionId !== sourceConnectionId)
        continue;
    }

    triggers.notify(instance.connectionId, type, data);
  }
}

/**
 * Publish a discord.message.created event
 */
export function publishMessageCreated(env: Env, message: Message): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  notifyAllConnections(
    "discord.message.created",
    {
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
    },
    connId,
  );
  console.log(`[Triggers] Notified discord.message.created: ${message.id}`);
}

/**
 * Publish a discord.message.deleted event
 */
export function publishMessageDeleted(env: Env, message: Message): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  notifyAllConnections(
    "discord.message.deleted",
    {
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
    },
    connId,
  );
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
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  notifyAllConnections(
    "discord.message.updated",
    {
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
    },
    connId,
  );
  console.log(`[Triggers] Notified discord.message.updated: ${newMessage.id}`);
}

/**
 * Publish a discord.member.joined event
 */
export function publishMemberJoined(_env: Env, member: GuildMember): void {
  notifyAllConnections("discord.member.joined", {
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
export function publishMemberLeft(_env: Env, member: GuildMember): void {
  notifyAllConnections("discord.member.left", {
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
  _env: Env,
  member: GuildMember,
  roleId: string,
  roleName: string,
): void {
  notifyAllConnections("discord.member.role.added", {
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
  _env: Env,
  member: GuildMember,
  roleId: string,
  roleName: string,
): void {
  notifyAllConnections("discord.member.role.removed", {
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
  _env: Env,
  reaction: MessageReaction,
  user: User,
): void {
  const emoji = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;

  notifyAllConnections("discord.reaction.added", {
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
  _env: Env,
  reaction: MessageReaction,
  user: User,
): void {
  const emoji = reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : reaction.emoji.name;

  notifyAllConnections("discord.reaction.removed", {
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
  _env: Env,
  thread: ThreadChannel | AnyThreadChannel,
): void {
  notifyAllConnections("discord.thread.created", {
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
  _env: Env,
  thread: ThreadChannel | AnyThreadChannel,
): void {
  notifyAllConnections("discord.thread.deleted", {
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
  _env: Env,
  oldThread: ThreadChannel | AnyThreadChannel,
  newThread: ThreadChannel | AnyThreadChannel,
): void {
  notifyAllConnections("discord.thread.updated", {
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
export function publishChannelCreated(_env: Env, channel: GuildChannel): void {
  const categoryName =
    "parent" in channel ? (channel.parent as CategoryChannel)?.name : undefined;

  notifyAllConnections("discord.channel.created", {
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
export function publishChannelDeleted(_env: Env, channel: GuildChannel): void {
  notifyAllConnections("discord.channel.deleted", {
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
