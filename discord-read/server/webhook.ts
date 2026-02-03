/**
 * Discord Webhook Utilities
 *
 * Handles Discord webhook verification and payload processing.
 */

import { verifyKey } from "discord-interactions";

/**
 * Discord Interaction Types
 */
export enum InteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPLETE = 4,
  MODAL_SUBMIT = 5,
}

/**
 * Discord Interaction Response Types
 */
export enum InteractionResponseType {
  PONG = 1,
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
  DEFERRED_UPDATE_MESSAGE = 6,
  UPDATE_MESSAGE = 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT = 8,
  MODAL = 9,
}

/**
 * Discord Interaction Payload
 */
export interface DiscordInteraction {
  id: string;
  application_id: string;
  type: InteractionType;
  data?: {
    id: string;
    name: string;
    type: number;
    options?: Array<{
      name: string;
      type: number;
      value: string | number | boolean;
    }>;
  };
  guild_id?: string;
  channel_id?: string;
  member?: {
    user: {
      id: string;
      username: string;
      discriminator: string;
      avatar?: string;
    };
    roles: string[];
    nick?: string;
  };
  user?: {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string;
  };
  token: string;
  version: number;
  message?: any;
}

/**
 * Verify Discord webhook signature using Ed25519
 */
export function verifyDiscordRequest(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
): { verified: boolean; payload: DiscordInteraction | null } {
  if (!signature || !timestamp) {
    return { verified: false, payload: null };
  }

  try {
    const isValid = verifyKey(rawBody, signature, timestamp, publicKey);

    if (!isValid) {
      return { verified: false, payload: null };
    }

    const payload = JSON.parse(rawBody) as DiscordInteraction;
    return { verified: true, payload };
  } catch (error) {
    console.error("[Webhook] Verification error:", error);
    return { verified: false, payload: null };
  }
}

/**
 * Parse slash command from Discord interaction
 */
export function parseSlashCommand(interaction: DiscordInteraction): {
  command: string;
  options: Record<string, string | number | boolean>;
} | null {
  if (
    interaction.type !== InteractionType.APPLICATION_COMMAND ||
    !interaction.data
  ) {
    return null;
  }

  const command = interaction.data.name;
  const options: Record<string, string | number | boolean> = {};

  if (interaction.data.options) {
    for (const opt of interaction.data.options) {
      options[opt.name] = opt.value;
    }
  }

  return { command, options };
}

/**
 * Create a Discord interaction response
 */
export function createInteractionResponse(
  type: InteractionResponseType,
  content?: string,
  ephemeral = false,
): any {
  const response: any = {
    type,
  };

  if (content) {
    response.data = {
      content,
      flags: ephemeral ? 64 : 0, // 64 = EPHEMERAL
    };
  }

  return response;
}

/**
 * Get user info from interaction (handles both guild and DM)
 */
export function getUserFromInteraction(interaction: DiscordInteraction): {
  id: string;
  username: string;
  displayName: string;
} | null {
  const user = interaction.member?.user || interaction.user;
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: interaction.member?.nick || user.username,
  };
}
