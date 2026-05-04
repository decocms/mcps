/**
 * Trigger catalog — every event the MCP can emit.
 *
 * This file is the source of truth for what an agent can subscribe to.
 * 22 default + 4 interactions (Phase 3) + 3 opt-in (presence/typing/voice,
 * guarded by StateSchema flags in events.ts).
 *
 * Filter shapes intentionally mirror the payload fields so an agent can
 * narrow on the same names that arrive in the trigger body.
 */

import { z } from "zod";

const guildOnly = z.object({
  guild_id: z
    .string()
    .optional()
    .describe("Filter by guild ID. Empty = all guilds."),
});

const guildAndChannel = z.object({
  guild_id: z
    .string()
    .optional()
    .describe("Filter by guild ID. Empty = all guilds."),
  channel_id: z
    .string()
    .optional()
    .describe("Filter by channel ID. Empty = all channels."),
});

const messageFilter = z.object({
  guild_id: z
    .string()
    .optional()
    .describe(
      "Filter by guild ID. Empty = all guilds (and DMs if is_dm allows).",
    ),
  channel_id: z.string().optional().describe("Filter by channel ID."),
  is_dm: z
    .boolean()
    .optional()
    .describe(
      "true = only DMs, false = only guild messages, undefined = both. DMs are scoped to the originating connection only.",
    ),
  dm_user_id: z.string().optional().describe("Filter DMs by author user ID."),
  author_bot: z
    .boolean()
    .optional()
    .describe("Filter by author type. false = humans only, true = bots only."),
});

const reactionFilter = z.object({
  guild_id: z.string().optional(),
  channel_id: z.string().optional(),
  message_id: z.string().optional(),
  emoji: z
    .string()
    .optional()
    .describe("Match by emoji name (e.g. '👍') or unicode."),
  is_dm: z.boolean().optional(),
});

const interactionFilter = z.object({
  guild_id: z.string().optional(),
  channel_id: z.string().optional(),
  custom_id: z.string().optional().describe("Exact custom_id match."),
  custom_id_prefix: z
    .string()
    .optional()
    .describe(
      "Match interactions whose custom_id starts with this prefix (e.g. 'order:' to match order:approve, order:reject).",
    ),
});

export const triggerDefinitions = [
  // ============================================================================
  // Messages
  // ============================================================================
  {
    type: "discord.message.created",
    description:
      "A message was sent in a guild channel or as a DM to the bot. Includes the bot's own messages — filter `author_bot: false` to exclude bots.",
    params: messageFilter,
  },
  {
    type: "discord.message.updated",
    description: "A message was edited.",
    params: messageFilter,
  },
  {
    type: "discord.message.deleted",
    description: "A message was deleted.",
    params: messageFilter,
  },
  {
    type: "discord.message.bulk_deleted",
    description:
      "Multiple messages were deleted at once (admin bulk delete). Single payload with all deleted message IDs.",
    params: guildAndChannel,
  },

  // ============================================================================
  // Reactions
  // ============================================================================
  {
    type: "discord.reaction.added",
    description: "A reaction was added to a message.",
    params: reactionFilter,
  },
  {
    type: "discord.reaction.removed",
    description: "A reaction was removed from a message.",
    params: reactionFilter,
  },

  // ============================================================================
  // Members
  // ============================================================================
  {
    type: "discord.member.joined",
    description: "A user joined a guild.",
    params: guildOnly,
  },
  {
    type: "discord.member.left",
    description: "A user left or was kicked from a guild.",
    params: guildOnly,
  },
  {
    type: "discord.member.updated",
    description:
      "A member's profile changed inside a guild — nickname, avatar, timeout, pending status, communication disabled until.",
    params: guildOnly,
  },
  {
    type: "discord.member.role.added",
    description: "A role was added to a guild member.",
    params: z.object({
      guild_id: z.string().optional(),
      role_id: z.string().optional().describe("Filter by role ID."),
    }),
  },
  {
    type: "discord.member.role.removed",
    description: "A role was removed from a guild member.",
    params: z.object({
      guild_id: z.string().optional(),
      role_id: z.string().optional(),
    }),
  },

  // ============================================================================
  // Threads
  // ============================================================================
  {
    type: "discord.thread.created",
    description: "A thread or forum post was created.",
    params: guildAndChannel,
  },
  {
    type: "discord.thread.updated",
    description: "A thread was archived, unarchived, locked, renamed, etc.",
    params: guildAndChannel,
  },
  {
    type: "discord.thread.deleted",
    description: "A thread was deleted.",
    params: guildAndChannel,
  },

  // ============================================================================
  // Channels
  // ============================================================================
  {
    type: "discord.channel.created",
    description: "A channel was created in a guild.",
    params: guildOnly,
  },
  {
    type: "discord.channel.updated",
    description:
      "A channel was modified — name, topic, position, permission overwrites.",
    params: guildOnly,
  },
  {
    type: "discord.channel.deleted",
    description: "A channel was deleted from a guild.",
    params: guildOnly,
  },

  // ============================================================================
  // Roles
  // ============================================================================
  {
    type: "discord.role.created",
    description: "A role was created in a guild.",
    params: guildOnly,
  },
  {
    type: "discord.role.updated",
    description: "A role was modified — name, color, permissions, position.",
    params: guildOnly,
  },
  {
    type: "discord.role.deleted",
    description: "A role was deleted from a guild.",
    params: guildOnly,
  },

  // ============================================================================
  // Guild lifecycle
  // ============================================================================
  {
    type: "discord.guild.joined",
    description: "The bot was added to a new guild.",
    params: z.object({}),
  },
  {
    type: "discord.guild.left",
    description:
      "The bot was removed from a guild (kicked, banned, or guild deleted).",
    params: z.object({}),
  },

  // ============================================================================
  // Interactions (Phase 3 will populate the events.ts handler)
  // ============================================================================
  {
    type: "discord.interaction.button",
    description:
      "A user clicked a button. The MCP auto-defers within 100ms; the agent has 15 minutes to call DISCORD_INTERACTION_FOLLOWUP using the interaction_token from this payload.",
    params: interactionFilter,
  },
  {
    type: "discord.interaction.select",
    description:
      "A user submitted a select-menu choice. Auto-deferred. Use DISCORD_INTERACTION_FOLLOWUP to respond.",
    params: interactionFilter,
  },
  {
    type: "discord.interaction.modal_submit",
    description:
      "A user submitted a modal form. Auto-deferred. Use DISCORD_INTERACTION_FOLLOWUP to respond.",
    params: interactionFilter,
  },
  {
    type: "discord.interaction.slash_command",
    description:
      "A user invoked a slash command. The MCP does not register slash commands itself — register externally via the Discord Developer Portal. Auto-deferred (unless AUTO_DEFER_MODE='off'). Use DISCORD_INTERACTION_FOLLOWUP to respond.",
    params: z.object({
      guild_id: z.string().optional(),
      channel_id: z.string().optional(),
      command_name: z.string().optional().describe("Filter by command name."),
    }),
  },

  // ============================================================================
  // Opt-in (high-volume) — handler emits only when the corresponding flag is on
  // ============================================================================
  {
    type: "discord.presence.updated",
    description:
      "[OPT-IN] A user's presence changed (online/offline/activity). Requires ENABLE_PRESENCE_EVENTS=true and the GuildPresences privileged intent.",
    params: guildOnly,
  },
  {
    type: "discord.typing.started",
    description:
      "[OPT-IN] A user started typing. Requires ENABLE_TYPING_EVENTS=true. High frequency.",
    params: guildAndChannel,
  },
  {
    type: "discord.voice.state.updated",
    description:
      "[OPT-IN] A user joined/left a voice channel or muted/deafened. Requires ENABLE_VOICE_EVENTS=true.",
    params: guildOnly,
  },
];
