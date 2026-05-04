/**
 * Discord.js Gateway event handlers — wires every event to a publisher.
 *
 * No business logic lives here: every handler is a thin adapter that calls
 * the right publish* helper. Multi-tenant safety + privacy filters are in
 * `triggers/publisher.ts`.
 */

import {
  type Client,
  type Message,
  type MessageReaction,
  type User,
  type GuildMember,
  type PartialMessage,
  type PartialMessageReaction,
  type PartialUser,
  type GuildChannel,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import type { BotInstance } from "./instance.ts";
import {
  publishMessageCreated,
  publishMessageUpdated,
  publishMessageDeleted,
  publishMessageBulkDeleted,
  publishReactionAdded,
  publishReactionRemoved,
  publishMemberJoined,
  publishMemberLeft,
  publishMemberUpdated,
  publishMemberRoleAdded,
  publishMemberRoleRemoved,
  publishThreadCreated,
  publishThreadUpdated,
  publishThreadDeleted,
  publishChannelCreated,
  publishChannelUpdated,
  publishChannelDeleted,
  publishRoleCreated,
  publishRoleUpdated,
  publishRoleDeleted,
  publishGuildJoined,
  publishGuildLeft,
  publishPresenceUpdated,
  publishTypingStarted,
  publishVoiceStateUpdated,
  publishInteractionButton,
  publishInteractionSelect,
  publishInteractionModalSubmit,
  publishInteractionSlashCommand,
} from "../triggers/publisher.ts";
import * as interactionStore from "../triggers/interaction-store.ts";

// Debounce window for processedMessageIds: discord.js can emit duplicate
// events on reconnect; 10s is enough to drop the duplicate without holding memory.
const MESSAGE_DEDUP_TTL_MS = 10_000;

/**
 * Wrap a Discord.js event listener with a swallowing try/catch so a single
 * bad event doesn't propagate up to the gateway client and crash the loop.
 */
function wrap<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void | Promise<void>,
): (...args: TArgs) => Promise<void> {
  return async (...args) => {
    try {
      await fn(...args);
    } catch {
      // swallow: we don't log, but a bad event must not bring down the bot
    }
  };
}

export function registerEventHandlers(
  client: Client,
  instance: BotInstance,
): void {
  client.removeAllListeners();
  const processedMessageIds = new Set<string>();

  // ============================================================================
  // Messages
  // ============================================================================
  client.on(
    "messageCreate",
    wrap(async (message: Message) => {
      if (processedMessageIds.has(message.id)) return;
      processedMessageIds.add(message.id);
      setTimeout(
        () => processedMessageIds.delete(message.id),
        MESSAGE_DEDUP_TTL_MS,
      );
      publishMessageCreated(instance.env, message);
    }),
  );

  client.on(
    "messageUpdate",
    wrap(async (oldMessage, newMessage) => {
      if (newMessage.partial) await newMessage.fetch();
      publishMessageUpdated(
        instance.env,
        oldMessage as Message | PartialMessage,
        newMessage as Message,
      );
    }),
  );

  client.on(
    "messageDelete",
    wrap(async (message) => {
      publishMessageDeleted(instance.env, message as Message | PartialMessage);
    }),
  );

  client.on(
    "messageDeleteBulk",
    wrap(async (messages) => {
      publishMessageBulkDeleted(instance.env, messages);
    }),
  );

  // ============================================================================
  // Reactions
  // ============================================================================
  client.on(
    "messageReactionAdd",
    wrap(
      async (
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser,
      ) => {
        if (reaction.partial) await reaction.fetch();
        if (user.partial) await user.fetch();
        if (!reaction.partial && !user.partial) {
          publishReactionAdded(
            instance.env,
            reaction as MessageReaction,
            user as User,
          );
        }
      },
    ),
  );

  client.on(
    "messageReactionRemove",
    wrap(
      async (
        reaction: MessageReaction | PartialMessageReaction,
        user: User | PartialUser,
      ) => {
        if (reaction.partial) await reaction.fetch();
        if (user.partial) await user.fetch();
        if (!reaction.partial && !user.partial) {
          publishReactionRemoved(
            instance.env,
            reaction as MessageReaction,
            user as User,
          );
        }
      },
    ),
  );

  // ============================================================================
  // Members
  // ============================================================================
  client.on(
    "guildMemberAdd",
    wrap(async (member) => {
      publishMemberJoined(instance.env, member);
    }),
  );

  client.on(
    "guildMemberRemove",
    wrap(async (member) => {
      publishMemberLeft(instance.env, member);
    }),
  );

  client.on(
    "guildMemberUpdate",
    wrap(async (oldMember, newMember) => {
      publishMemberUpdated(instance.env, oldMember, newMember as GuildMember);

      if (!oldMember.partial) {
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;

        newRoles.forEach((role) => {
          if (!oldRoles.has(role.id)) {
            publishMemberRoleAdded(
              instance.env,
              newMember as GuildMember,
              role.id,
              role.name,
            );
          }
        });

        oldRoles.forEach((role) => {
          if (!newRoles.has(role.id)) {
            publishMemberRoleRemoved(
              instance.env,
              newMember as GuildMember,
              role.id,
              role.name,
            );
          }
        });
      }
    }),
  );

  // ============================================================================
  // Threads
  // ============================================================================
  client.on(
    "threadCreate",
    wrap(async (thread) => {
      publishThreadCreated(instance.env, thread);
    }),
  );

  client.on(
    "threadUpdate",
    wrap(async (oldThread, newThread) => {
      publishThreadUpdated(instance.env, oldThread, newThread);
    }),
  );

  client.on(
    "threadDelete",
    wrap(async (thread) => {
      publishThreadDeleted(instance.env, thread);
    }),
  );

  // ============================================================================
  // Channels
  // ============================================================================
  client.on(
    "channelCreate",
    wrap(async (channel) => {
      if (!("guild" in channel) || !channel.guild) return;
      publishChannelCreated(instance.env, channel as GuildChannel);
    }),
  );

  client.on(
    "channelUpdate",
    wrap(async (oldChannel, newChannel) => {
      if (!("guild" in newChannel) || !newChannel.guild) return;
      publishChannelUpdated(
        instance.env,
        oldChannel as GuildChannel,
        newChannel as GuildChannel,
      );
    }),
  );

  client.on(
    "channelDelete",
    wrap(async (channel) => {
      if (!("guild" in channel) || !channel.guild) return;
      publishChannelDeleted(instance.env, channel as GuildChannel);
    }),
  );

  // ============================================================================
  // Roles
  // ============================================================================
  client.on(
    "roleCreate",
    wrap(async (role) => {
      publishRoleCreated(instance.env, role);
    }),
  );

  client.on(
    "roleUpdate",
    wrap(async (oldRole, newRole) => {
      publishRoleUpdated(instance.env, oldRole, newRole);
    }),
  );

  client.on(
    "roleDelete",
    wrap(async (role) => {
      publishRoleDeleted(instance.env, role);
    }),
  );

  // ============================================================================
  // Guild lifecycle
  // ============================================================================
  client.on(
    "guildCreate",
    wrap(async (guild) => {
      publishGuildJoined(instance.env, guild);
    }),
  );

  client.on(
    "guildDelete",
    wrap(async (guild) => {
      publishGuildLeft(instance.env, guild);
    }),
  );

  // ============================================================================
  // Interactions (button / select / modal_submit / slash command)
  //
  // Discord requires ACK within 3s. Round-trip MCP→Studio→agent→tool→MCP is
  // too slow, so we auto-defer immediately, record the token in the local
  // interaction-store, then emit the trigger. Agent has 15 minutes to call
  // DISCORD_INTERACTION_FOLLOWUP / _UPDATE.
  // ============================================================================
  client.on(
    "interactionCreate",
    wrap(async (interaction) => {
      const autoDeferMode =
        instance.env.MESH_REQUEST_CONTEXT?.state?.AUTO_DEFER_MODE ??
        "ephemeral";
      const ephemeralFlag =
        autoDeferMode === "ephemeral" ? MessageFlags.Ephemeral : undefined;

      // Defer FIRST. Anything async before this risks the 3s deadline.
      if (interaction.isButton() || interaction.isAnySelectMenu()) {
        if (autoDeferMode !== "off") {
          await interaction.deferUpdate();
        }
      } else if (
        interaction.isChatInputCommand() ||
        interaction.isModalSubmit()
      ) {
        if (autoDeferMode !== "off") {
          await interaction.deferReply({ flags: ephemeralFlag });
        }
      } else {
        return; // Autocomplete and other types: not handled here.
      }

      interactionStore.set({
        interaction_id: interaction.id,
        token: interaction.token,
        application_id: interaction.applicationId,
        type: interaction.type as number,
        custom_id:
          "customId" in interaction
            ? (interaction.customId as string | undefined)
            : undefined,
        channel_id: interaction.channelId ?? undefined,
        guild_id: interaction.guildId ?? undefined,
      });

      if (interaction.isButton()) {
        publishInteractionButton(
          instance.env,
          interaction as ButtonInteraction,
        );
      } else if (interaction.isAnySelectMenu()) {
        publishInteractionSelect(
          instance.env,
          interaction as AnySelectMenuInteraction,
        );
      } else if (interaction.isModalSubmit()) {
        publishInteractionModalSubmit(
          instance.env,
          interaction as ModalSubmitInteraction,
        );
      } else if (interaction.isChatInputCommand()) {
        publishInteractionSlashCommand(
          instance.env,
          interaction as ChatInputCommandInteraction,
        );
      }
    }),
  );

  // ============================================================================
  // Opt-in (gated by StateSchema flags)
  // ============================================================================
  const state = instance.env.MESH_REQUEST_CONTEXT?.state;

  if (state?.ENABLE_PRESENCE_EVENTS) {
    client.on(
      "presenceUpdate",
      wrap(async (_oldPresence, newPresence) => {
        publishPresenceUpdated(instance.env, newPresence);
      }),
    );
  }

  if (state?.ENABLE_TYPING_EVENTS) {
    client.on(
      "typingStart",
      wrap(async (typing) => {
        publishTypingStarted(instance.env, typing);
      }),
    );
  }

  if (state?.ENABLE_VOICE_EVENTS) {
    client.on(
      "voiceStateUpdate",
      wrap(async (oldState, newState) => {
        publishVoiceStateUpdated(instance.env, oldState, newState);
      }),
    );
  }
}
