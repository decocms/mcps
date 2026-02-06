/**
 * Discord Webhook Utilities
 *
 * Handles Discord webhook verification and payload processing.
 * Uses tweetnacl for Ed25519 signature verification (more reliable than discord-interactions).
 */

import nacl from "tweetnacl";

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
  type: InteractionType | number; // Allow number for type 0 (webhook events verification)
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
  message?: unknown;
}

/**
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string: odd length");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Verify Discord webhook signature using Ed25519 (tweetnacl)
 *
 * @param body - Raw request body as string (not parsed)
 * @param signature - X-Signature-Ed25519 header
 * @param timestamp - X-Signature-Timestamp header
 * @param publicKey - Discord Public Key (from Developer Portal)
 * @returns true if signature is valid, false otherwise
 */
export function verifyDiscordSignature(
  body: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
): boolean {
  if (!signature || !timestamp) {
    console.error("[Webhook] Missing signature or timestamp headers");
    return false;
  }

  try {
    // Validate timestamp (reject requests older than 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp, 10);

    if (isNaN(requestTime)) {
      console.error("[Webhook] Invalid timestamp format");
      return false;
    }

    const timeDiff = Math.abs(now - requestTime);
    if (timeDiff > 300) {
      // 5 minutes
      console.warn(
        `[Webhook] Request timestamp too old: ${timeDiff}s difference`,
      );
      return false;
    }

    // Build the message that Discord signed
    const message = timestamp + body;

    // Convert from hex to bytes
    const signatureBytes = hexToUint8Array(signature);
    const publicKeyBytes = hexToUint8Array(publicKey);
    const messageBytes = new TextEncoder().encode(message);

    // Verify signature using Ed25519
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes,
    );

    if (!isValid) {
      console.error("[Webhook] Invalid signature");
    }

    return isValid;
  } catch (error) {
    console.error("[Webhook] Error verifying Discord signature:", error);
    return false;
  }
}

/**
 * Verify Discord webhook signature and parse payload
 */
export function verifyDiscordRequest(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
): { verified: boolean; payload: DiscordInteraction | null } {
  const isValid = verifyDiscordSignature(
    rawBody,
    signature,
    timestamp,
    publicKey,
  );

  if (!isValid) {
    return { verified: false, payload: null };
  }

  try {
    const payload = JSON.parse(rawBody) as DiscordInteraction;
    return { verified: true, payload };
  } catch (error) {
    console.error("[Webhook] Failed to parse payload:", error);
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
