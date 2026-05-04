/**
 * Multi-tenant trigger fan-out.
 *
 * Privacy contract:
 *   - Guild events: notify any connection whose bot is a member of the guild
 *     (or any connection without a running bot, since we can't check
 *     membership without a client — those connections may have triggers
 *     configured for offline use).
 *   - DM events: notify ONLY the connection that owns the bot which received
 *     the DM. Cross-tenant DM leakage is a non-starter.
 *
 * Each helper builds a payload that mirrors the trigger's filter params so
 * the runtime can match subscriptions efficiently.
 */

import type {
  Message,
  GuildMember,
  MessageReaction,
  User,
  ThreadChannel,
  AnyThreadChannel,
  GuildChannel,
  CategoryChannel,
  Role,
  Guild,
  PartialGuildMember,
  PartialMessage,
  Presence,
  Typing,
  VoiceState,
  ReadonlyCollection,
  Snowflake,
  ButtonInteraction,
  AnySelectMenuInteraction,
  ModalSubmitInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import type { Env } from "../types/env.ts";
import { triggers } from "./store.ts";
import { getAllInstances } from "../bot/instance.ts";

type TriggerType = Parameters<(typeof triggers)["notify"]>[1];

function notifyAllConnections(
  type: TriggerType,
  data: Record<string, unknown>,
  sourceConnectionId?: string,
): void {
  const instances = getAllInstances();
  const guildId = data.guild_id as string | undefined;

  for (const instance of instances) {
    if (guildId) {
      // Guild event: skip connections whose bot is online but not in this guild.
      if (
        instance.client?.isReady() &&
        !instance.client.guilds.cache.has(guildId)
      ) {
        continue;
      }
    } else {
      // DM (or non-guild) event: only notify the originating connection.
      if (sourceConnectionId && instance.connectionId !== sourceConnectionId) {
        continue;
      }
    }

    triggers.notify(instance.connectionId, type, data);
  }
}

function isoOrUndefined(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString() : undefined;
}

// ============================================================================
// Messages
// ============================================================================

export function publishMessageCreated(env: Env, message: Message): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  const isDM = !message.guild;
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
      author_global_name: message.author.globalName,
      author_bot: message.author.bot,
      content: message.content,
      attachments: message.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        name: a.name,
        size: a.size,
        content_type: a.contentType,
      })),
      attachment_count: message.attachments.size,
      embeds: message.embeds.length,
      mention_everyone: message.mentions.everyone,
      mention_user_ids: message.mentions.users.map((u) => u.id),
      mention_role_ids: message.mentions.roles.map((r) => r.id),
      is_dm: isDM,
      dm_user_id: isDM ? message.author.id : undefined,
      timestamp: message.createdAt.toISOString(),
      referenced_message_id: message.reference?.messageId,
    },
    connId,
  );
}

export function publishMessageUpdated(
  env: Env,
  oldMessage: Message | PartialMessage,
  newMessage: Message,
): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  const isDM = !newMessage.guild;
  notifyAllConnections(
    "discord.message.updated",
    {
      event: "discord.message.updated",
      subject: newMessage.id,
      message_id: newMessage.id,
      guild_id: newMessage.guild?.id,
      channel_id: newMessage.channelId,
      author_id: newMessage.author.id,
      author_username: newMessage.author.username,
      author_bot: newMessage.author.bot,
      old_content: oldMessage.partial ? undefined : oldMessage.content,
      new_content: newMessage.content,
      content_changed:
        !oldMessage.partial && oldMessage.content !== newMessage.content,
      is_dm: isDM,
      dm_user_id: isDM ? newMessage.author.id : undefined,
      edited_at: isoOrUndefined(newMessage.editedAt),
    },
    connId,
  );
}

export function publishMessageDeleted(
  env: Env,
  message: Message | PartialMessage,
): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  const isDM = !message.guild;
  notifyAllConnections(
    "discord.message.deleted",
    {
      event: "discord.message.deleted",
      subject: message.id,
      message_id: message.id,
      guild_id: message.guild?.id,
      channel_id: message.channelId,
      author_id: message.author?.id,
      author_username: message.author?.username,
      author_bot: message.author?.bot,
      content: message.partial ? undefined : message.content,
      is_dm: isDM,
      dm_user_id: isDM ? message.author?.id : undefined,
      deleted_at: new Date().toISOString(),
    },
    connId,
  );
}

export function publishMessageBulkDeleted(
  env: Env,
  messages: ReadonlyCollection<Snowflake, Message | PartialMessage>,
): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  const first = messages.first();
  if (!first) return;
  notifyAllConnections(
    "discord.message.bulk_deleted",
    {
      event: "discord.message.bulk_deleted",
      subject: first.channelId,
      guild_id: first.guild?.id,
      channel_id: first.channelId,
      message_ids: Array.from(messages.keys()),
      message_count: messages.size,
      deleted_at: new Date().toISOString(),
    },
    connId,
  );
}

// ============================================================================
// Reactions
// ============================================================================

function emojiKey(reaction: MessageReaction): string {
  return reaction.emoji.id
    ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
    : (reaction.emoji.name ?? "?");
}

export function publishReactionAdded(
  env: Env,
  reaction: MessageReaction,
  user: User,
): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  const isDM = !reaction.message.guild;
  notifyAllConnections(
    "discord.reaction.added",
    {
      event: "discord.reaction.added",
      subject: reaction.message.id,
      message_id: reaction.message.id,
      guild_id: reaction.message.guild?.id,
      channel_id: reaction.message.channelId,
      user_id: user.id,
      username: user.username,
      emoji: emojiKey(reaction),
      emoji_id: reaction.emoji.id,
      emoji_name: reaction.emoji.name,
      is_dm: isDM,
      added_at: new Date().toISOString(),
    },
    connId,
  );
}

export function publishReactionRemoved(
  env: Env,
  reaction: MessageReaction,
  user: User,
): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  const isDM = !reaction.message.guild;
  notifyAllConnections(
    "discord.reaction.removed",
    {
      event: "discord.reaction.removed",
      subject: reaction.message.id,
      message_id: reaction.message.id,
      guild_id: reaction.message.guild?.id,
      channel_id: reaction.message.channelId,
      user_id: user.id,
      username: user.username,
      emoji: emojiKey(reaction),
      emoji_id: reaction.emoji.id,
      emoji_name: reaction.emoji.name,
      is_dm: isDM,
      removed_at: new Date().toISOString(),
    },
    connId,
  );
}

// ============================================================================
// Members
// ============================================================================

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
    joined_at: isoOrUndefined(member.joinedAt),
    account_created_at: member.user.createdAt.toISOString(),
  });
}

export function publishMemberLeft(
  _env: Env,
  member: GuildMember | PartialGuildMember,
): void {
  notifyAllConnections("discord.member.left", {
    event: "discord.member.left",
    subject: member.id,
    user_id: member.id,
    username: member.user?.username,
    guild_id: member.guild.id,
    guild_name: member.guild.name,
    left_at: new Date().toISOString(),
  });
}

export function publishMemberUpdated(
  _env: Env,
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): void {
  notifyAllConnections("discord.member.updated", {
    event: "discord.member.updated",
    subject: newMember.id,
    user_id: newMember.id,
    username: newMember.user.username,
    guild_id: newMember.guild.id,
    old_nickname: oldMember.nickname ?? undefined,
    new_nickname: newMember.nickname ?? undefined,
    nickname_changed: oldMember.nickname !== newMember.nickname,
    timed_out_until: isoOrUndefined(newMember.communicationDisabledUntil),
    pending: newMember.pending,
    updated_at: new Date().toISOString(),
  });
}

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
    role_id: roleId,
    role_name: roleName,
    added_at: new Date().toISOString(),
  });
}

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
    role_id: roleId,
    role_name: roleName,
    removed_at: new Date().toISOString(),
  });
}

// ============================================================================
// Threads
// ============================================================================

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
    channel_id: thread.parentId,
    channel_name: thread.parent?.name,
    owner_id: thread.ownerId,
    type: thread.type,
    archived: thread.archived,
    locked: thread.locked,
    message_count: thread.messageCount,
    member_count: thread.memberCount,
    created_at: isoOrUndefined(thread.createdAt),
  });
}

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
}

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
    channel_id: thread.parentId,
    deleted_at: new Date().toISOString(),
  });
}

// ============================================================================
// Channels
// ============================================================================

export function publishChannelCreated(_env: Env, channel: GuildChannel): void {
  const categoryName =
    "parent" in channel ? (channel.parent as CategoryChannel)?.name : undefined;
  notifyAllConnections("discord.channel.created", {
    event: "discord.channel.created",
    subject: channel.id,
    channel_id: channel.id,
    channel_name: channel.name,
    guild_id: channel.guild?.id,
    type: channel.type,
    parent_id: "parentId" in channel ? channel.parentId : undefined,
    category_name: categoryName,
    position: channel.position,
    created_at: isoOrUndefined(channel.createdAt),
  });
}

export function publishChannelUpdated(
  _env: Env,
  oldChannel: GuildChannel,
  newChannel: GuildChannel,
): void {
  notifyAllConnections("discord.channel.updated", {
    event: "discord.channel.updated",
    subject: newChannel.id,
    channel_id: newChannel.id,
    channel_name: newChannel.name,
    guild_id: newChannel.guild?.id,
    type: newChannel.type,
    old_name: oldChannel.name,
    new_name: newChannel.name,
    name_changed: oldChannel.name !== newChannel.name,
    old_position: oldChannel.position,
    new_position: newChannel.position,
    updated_at: new Date().toISOString(),
  });
}

export function publishChannelDeleted(_env: Env, channel: GuildChannel): void {
  notifyAllConnections("discord.channel.deleted", {
    event: "discord.channel.deleted",
    subject: channel.id,
    channel_id: channel.id,
    channel_name: channel.name,
    guild_id: channel.guild?.id,
    type: channel.type,
    deleted_at: new Date().toISOString(),
  });
}

// ============================================================================
// Roles
// ============================================================================

export function publishRoleCreated(_env: Env, role: Role): void {
  notifyAllConnections("discord.role.created", {
    event: "discord.role.created",
    subject: role.id,
    role_id: role.id,
    role_name: role.name,
    guild_id: role.guild.id,
    color: role.color,
    permissions: role.permissions.bitfield.toString(),
    position: role.position,
    hoist: role.hoist,
    mentionable: role.mentionable,
    created_at: isoOrUndefined(role.createdAt),
  });
}

export function publishRoleUpdated(
  _env: Env,
  oldRole: Role,
  newRole: Role,
): void {
  notifyAllConnections("discord.role.updated", {
    event: "discord.role.updated",
    subject: newRole.id,
    role_id: newRole.id,
    guild_id: newRole.guild.id,
    old_name: oldRole.name,
    new_name: newRole.name,
    old_color: oldRole.color,
    new_color: newRole.color,
    old_permissions: oldRole.permissions.bitfield.toString(),
    new_permissions: newRole.permissions.bitfield.toString(),
    permissions_changed:
      oldRole.permissions.bitfield !== newRole.permissions.bitfield,
    updated_at: new Date().toISOString(),
  });
}

export function publishRoleDeleted(_env: Env, role: Role): void {
  notifyAllConnections("discord.role.deleted", {
    event: "discord.role.deleted",
    subject: role.id,
    role_id: role.id,
    role_name: role.name,
    guild_id: role.guild.id,
    deleted_at: new Date().toISOString(),
  });
}

// ============================================================================
// Guild lifecycle
// ============================================================================

export function publishGuildJoined(_env: Env, guild: Guild): void {
  notifyAllConnections("discord.guild.joined", {
    event: "discord.guild.joined",
    subject: guild.id,
    guild_id: guild.id,
    guild_name: guild.name,
    member_count: guild.memberCount,
    owner_id: guild.ownerId,
    joined_at: new Date().toISOString(),
  });
}

export function publishGuildLeft(_env: Env, guild: Guild): void {
  notifyAllConnections("discord.guild.left", {
    event: "discord.guild.left",
    subject: guild.id,
    guild_id: guild.id,
    guild_name: guild.name,
    left_at: new Date().toISOString(),
  });
}

// ============================================================================
// Interactions (button / select / modal / slash command)
// ============================================================================

function interactionExpiresAt(): string {
  return new Date(Date.now() + 15 * 60 * 1000).toISOString();
}

export function publishInteractionButton(
  env: Env,
  interaction: ButtonInteraction,
): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  notifyAllConnections(
    "discord.interaction.button",
    {
      event: "discord.interaction.button",
      subject: interaction.id,
      interaction_id: interaction.id,
      interaction_token: interaction.token,
      application_id: interaction.applicationId,
      expires_at: interactionExpiresAt(),
      custom_id: interaction.customId,
      message_id: interaction.message.id,
      channel_id: interaction.channelId,
      guild_id: interaction.guildId ?? undefined,
      user_id: interaction.user.id,
      username: interaction.user.username,
      timestamp: new Date().toISOString(),
    },
    connId,
  );
}

export function publishInteractionSelect(
  env: Env,
  interaction: AnySelectMenuInteraction,
): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  notifyAllConnections(
    "discord.interaction.select",
    {
      event: "discord.interaction.select",
      subject: interaction.id,
      interaction_id: interaction.id,
      interaction_token: interaction.token,
      application_id: interaction.applicationId,
      expires_at: interactionExpiresAt(),
      custom_id: interaction.customId,
      selected_values: interaction.values,
      message_id: interaction.message.id,
      channel_id: interaction.channelId,
      guild_id: interaction.guildId ?? undefined,
      user_id: interaction.user.id,
      username: interaction.user.username,
      timestamp: new Date().toISOString(),
    },
    connId,
  );
}

export function publishInteractionModalSubmit(
  env: Env,
  interaction: ModalSubmitInteraction,
): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  const fields: Record<string, string> = {};
  for (const [key, field] of interaction.fields.fields) {
    // ModalData has subtype TextInputModalData with `.value`. Other modal field
    // types may not, so guard with `in`.
    if (
      "value" in field &&
      typeof (field as { value: unknown }).value === "string"
    ) {
      fields[key] = (field as { value: string }).value;
    }
  }
  notifyAllConnections(
    "discord.interaction.modal_submit",
    {
      event: "discord.interaction.modal_submit",
      subject: interaction.id,
      interaction_id: interaction.id,
      interaction_token: interaction.token,
      application_id: interaction.applicationId,
      expires_at: interactionExpiresAt(),
      custom_id: interaction.customId,
      field_values: fields,
      channel_id: interaction.channelId ?? undefined,
      guild_id: interaction.guildId ?? undefined,
      user_id: interaction.user.id,
      username: interaction.user.username,
      timestamp: new Date().toISOString(),
    },
    connId,
  );
}

export function publishInteractionSlashCommand(
  env: Env,
  interaction: ChatInputCommandInteraction,
): void {
  const connId = env.MESH_REQUEST_CONTEXT?.connectionId;
  // Flatten options into a simple object the agent can consume.
  const options: Record<string, unknown> = {};
  for (const opt of interaction.options.data) {
    options[opt.name] = opt.value ?? opt.options ?? null;
  }
  notifyAllConnections(
    "discord.interaction.slash_command",
    {
      event: "discord.interaction.slash_command",
      subject: interaction.id,
      interaction_id: interaction.id,
      interaction_token: interaction.token,
      application_id: interaction.applicationId,
      expires_at: interactionExpiresAt(),
      command_name: interaction.commandName,
      options,
      channel_id: interaction.channelId,
      guild_id: interaction.guildId ?? undefined,
      user_id: interaction.user.id,
      username: interaction.user.username,
      timestamp: new Date().toISOString(),
    },
    connId,
  );
}

// ============================================================================
// Opt-in: presence, typing, voice
// ============================================================================

export function publishPresenceUpdated(_env: Env, newPresence: Presence): void {
  if (!newPresence.userId || !newPresence.guild) return;
  notifyAllConnections("discord.presence.updated", {
    event: "discord.presence.updated",
    subject: newPresence.userId,
    user_id: newPresence.userId,
    guild_id: newPresence.guild.id,
    status: newPresence.status,
    activities: newPresence.activities.map((a) => ({
      type: a.type,
      name: a.name,
      state: a.state,
      details: a.details,
    })),
    updated_at: new Date().toISOString(),
  });
}

export function publishTypingStarted(_env: Env, typing: Typing): void {
  notifyAllConnections("discord.typing.started", {
    event: "discord.typing.started",
    subject: typing.user.id,
    user_id: typing.user.id,
    guild_id: typing.guild?.id,
    channel_id: typing.channel.id,
    started_at: new Date(typing.startedTimestamp).toISOString(),
  });
}

export function publishVoiceStateUpdated(
  _env: Env,
  oldState: VoiceState,
  newState: VoiceState,
): void {
  notifyAllConnections("discord.voice.state.updated", {
    event: "discord.voice.state.updated",
    subject: newState.id,
    user_id: newState.id,
    guild_id: newState.guild.id,
    old_channel_id: oldState.channelId,
    new_channel_id: newState.channelId,
    joined: !oldState.channelId && !!newState.channelId,
    left: !!oldState.channelId && !newState.channelId,
    moved:
      !!oldState.channelId &&
      !!newState.channelId &&
      oldState.channelId !== newState.channelId,
    self_mute: newState.selfMute,
    self_deaf: newState.selfDeaf,
    server_mute: newState.serverMute,
    server_deaf: newState.serverDeaf,
    updated_at: new Date().toISOString(),
  });
}
