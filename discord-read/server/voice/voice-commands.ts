/**
 * Voice Commands Module
 *
 * Integrates the full voice command flow:
 * Speech (User) -> STT (Whisper) -> LLM -> TTS (Response)
 *
 * Also handles sending responses via DM if configured.
 */

import type { Guild, User, VoiceChannel, Client, DMChannel } from "discord.js";
import type { VoiceConnection } from "@discordjs/voice";
import {
  joinVoiceChannelSafe,
  leaveVoiceChannel,
  getActiveConnection,
  isConnectedToVoice,
  getMemberVoiceChannel,
} from "./voice-client.ts";
import {
  setAudioCompleteCallback,
  setupSpeakingListener,
  clearAllBuffers,
  type CompletedAudio,
} from "./audio-receiver.ts";
import {
  transcribeAudioBase64,
  configureWhisperSTT,
  isWhisperConfigured,
} from "./transcription.ts";
import {
  speakInChannel,
  configureTTS,
  isTTSEnabled,
  sayGreeting,
  sayGoodbye,
  cleanupPlayer,
} from "./tts-speaker.ts";

// ============================================================================
// Types
// ============================================================================

export interface VoiceConfig {
  enabled: boolean;
  responseMode: "voice" | "dm" | "both";
  ttsEnabled: boolean;
  ttsLanguage: string;
  silenceThresholdMs: number;
}

export interface VoiceCommandHandler {
  processVoiceCommand: (
    userId: string,
    username: string,
    text: string,
    guildId: string,
  ) => Promise<string>;
}

// ============================================================================
// State
// ============================================================================

let voiceConfig: VoiceConfig = {
  enabled: false,
  responseMode: "voice",
  ttsEnabled: true,
  ttsLanguage: "pt-BR",
  silenceThresholdMs: 1000,
};

let discordClient: Client | null = null;
let commandHandler: VoiceCommandHandler | null = null;

// Track active voice sessions
const activeSessions = new Map<
  string,
  {
    guildId: string;
    channelId: string;
    startedAt: Date;
    lastActivity: Date;
  }
>();

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configure voice command system
 */
export function configureVoiceCommands(
  client: Client,
  config: Partial<VoiceConfig>,
  handler: VoiceCommandHandler,
): void {
  discordClient = client;
  voiceConfig = { ...voiceConfig, ...config };
  commandHandler = handler;

  // Configure TTS
  configureTTS({
    enabled: voiceConfig.ttsEnabled,
    language: voiceConfig.ttsLanguage,
  });

  console.log("[VoiceCommands] Configured:", voiceConfig);
}

/**
 * Configure Whisper for STT
 */
export function configureVoiceWhisper(config: {
  meshUrl: string;
  organizationId: string;
  token: string;
  whisperConnectionId: string;
}): void {
  configureWhisperSTT(config);
}

/**
 * Check if voice commands are enabled
 */
export function isVoiceEnabled(): boolean {
  return voiceConfig.enabled;
}

// ============================================================================
// Voice Session Management
// ============================================================================

/**
 * Start listening in a voice channel
 */
export async function startVoiceSession(
  channel: VoiceChannel,
  guild: Guild,
): Promise<boolean> {
  if (!voiceConfig.enabled) {
    console.log("[VoiceCommands] Voice is disabled");
    return false;
  }

  if (!isWhisperConfigured()) {
    console.log("[VoiceCommands] Whisper not configured for STT");
    return false;
  }

  if (!commandHandler) {
    console.log("[VoiceCommands] No command handler configured");
    return false;
  }

  try {
    // Join the voice channel
    const connection = await joinVoiceChannelSafe(channel, guild);
    if (!connection) {
      console.log("[VoiceCommands] Failed to join voice channel");
      return false;
    }

    // Set up audio callback
    setAudioCompleteCallback(async (audio: CompletedAudio) => {
      await handleVoiceCommand(audio, connection, guild.id);
    });

    // Set up speaking listener
    setupSpeakingListener(connection, async (userId: string) => {
      if (!discordClient) return null;
      try {
        return await discordClient.users.fetch(userId);
      } catch {
        return null;
      }
    });

    // Track session
    activeSessions.set(guild.id, {
      guildId: guild.id,
      channelId: channel.id,
      startedAt: new Date(),
      lastActivity: new Date(),
    });

    // Say greeting
    if (voiceConfig.ttsEnabled) {
      await sayGreeting(connection, guild.id, voiceConfig.ttsLanguage);
    }

    console.log(`[VoiceCommands] ✅ Voice session started in ${channel.name}`);
    return true;
  } catch (error) {
    console.error("[VoiceCommands] Error starting session:", error);
    return false;
  }
}

/**
 * Stop voice session in a guild
 */
export async function stopVoiceSession(guildId: string): Promise<boolean> {
  const connection = getActiveConnection(guildId);

  if (connection && voiceConfig.ttsEnabled) {
    // Say goodbye before leaving
    await sayGoodbye(connection, guildId, voiceConfig.ttsLanguage);
    // Small delay to let the audio finish
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  // Clean up
  clearAllBuffers();
  cleanupPlayer(guildId);
  activeSessions.delete(guildId);

  // Leave channel
  const left = leaveVoiceChannel(guildId);

  console.log(`[VoiceCommands] Voice session stopped for guild ${guildId}`);
  return left;
}

/**
 * Handle a completed voice command
 */
async function handleVoiceCommand(
  audio: CompletedAudio,
  connection: VoiceConnection,
  guildId: string,
): Promise<void> {
  if (!commandHandler) {
    console.log("[VoiceCommands] No command handler");
    return;
  }

  // Update last activity
  const session = activeSessions.get(guildId);
  if (session) {
    session.lastActivity = new Date();
  }

  try {
    console.log(
      `[VoiceCommands] Processing voice from ${audio.username} (${audio.duration}ms)`,
    );

    // Transcribe audio
    const transcription = await transcribeAudioBase64(audio);
    if (!transcription || !transcription.text) {
      console.log("[VoiceCommands] No transcription result");
      return;
    }

    console.log(`[VoiceCommands] 🗣️ ${audio.username}: "${transcription.text}"`);

    // Check for exit commands
    const lowerText = transcription.text.toLowerCase();
    if (
      lowerText.includes("bot, saia") ||
      lowerText.includes("bot saia") ||
      lowerText.includes("bot, sair") ||
      lowerText.includes("deixar canal") ||
      lowerText.includes("leave channel") ||
      lowerText.includes("bot leave")
    ) {
      console.log("[VoiceCommands] Exit command detected");
      await stopVoiceSession(guildId);
      return;
    }

    // Process command with LLM
    const response = await commandHandler.processVoiceCommand(
      audio.userId,
      audio.username,
      transcription.text,
      guildId,
    );

    if (!response) {
      console.log("[VoiceCommands] No response from LLM");
      return;
    }

    console.log(
      `[VoiceCommands] 🤖 Response: "${response.substring(0, 100)}${response.length > 100 ? "..." : ""}"`,
    );

    // Respond based on mode
    if (
      voiceConfig.responseMode === "voice" ||
      voiceConfig.responseMode === "both"
    ) {
      // Respond via TTS in voice channel
      if (isTTSEnabled()) {
        await speakInChannel(connection, response, guildId, {
          language: voiceConfig.ttsLanguage,
        });
      }
    }

    if (
      voiceConfig.responseMode === "dm" ||
      voiceConfig.responseMode === "both"
    ) {
      // Also send DM
      await sendDMResponse(audio.userId, transcription.text, response);
    }
  } catch (error) {
    console.error("[VoiceCommands] Error handling command:", error);

    // Try to speak error message
    if (isTTSEnabled()) {
      await speakInChannel(
        connection,
        "Desculpe, ocorreu um erro ao processar seu comando.",
        guildId,
        { language: voiceConfig.ttsLanguage },
      );
    }
  }
}

/**
 * Send response via DM
 */
async function sendDMResponse(
  userId: string,
  userText: string,
  response: string,
): Promise<void> {
  if (!discordClient) return;

  try {
    const user = await discordClient.users.fetch(userId);
    const dmChannel = (await user.createDM()) as DMChannel;

    // Format message
    const message =
      `🎤 **Seu comando de voz:**\n> ${userText}\n\n` +
      `🤖 **Resposta:**\n${response}`;

    // Send (split if needed)
    if (message.length <= 2000) {
      await dmChannel.send(message);
    } else {
      // Split at natural break
      await dmChannel.send(`🎤 **Seu comando de voz:**\n> ${userText}`);
      await dmChannel.send(
        `🤖 **Resposta:**\n${response.substring(0, 1900)}...`,
      );
    }

    console.log(`[VoiceCommands] DM sent to ${user.username}`);
  } catch (error) {
    console.error("[VoiceCommands] Error sending DM:", error);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if there's an active session in a guild
 */
export function hasActiveSession(guildId: string): boolean {
  return activeSessions.has(guildId) && isConnectedToVoice(guildId);
}

/**
 * Get session info for a guild
 */
export function getSessionInfo(guildId: string): {
  guildId: string;
  channelId: string;
  startedAt: Date;
  lastActivity: Date;
} | null {
  return activeSessions.get(guildId) ?? null;
}

/**
 * Get all active sessions
 */
export function getAllSessions(): Array<{
  guildId: string;
  channelId: string;
  startedAt: Date;
  lastActivity: Date;
}> {
  return Array.from(activeSessions.values());
}

/**
 * Stop all voice sessions
 */
export async function stopAllSessions(): Promise<void> {
  const guildIds = Array.from(activeSessions.keys());
  for (const guildId of guildIds) {
    await stopVoiceSession(guildId);
  }
}

/**
 * Join the same channel as a user
 */
export async function joinUserChannel(
  user: User,
  guild: Guild,
): Promise<boolean> {
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    console.log(`[VoiceCommands] Could not fetch member ${user.username}`);
    return false;
  }

  const channel = getMemberVoiceChannel(member);
  if (!channel) {
    console.log(`[VoiceCommands] ${user.username} is not in a voice channel`);
    return false;
  }

  return startVoiceSession(channel, guild);
}

// ============================================================================
// Index Export
// ============================================================================

export {
  joinVoiceChannelSafe,
  leaveVoiceChannel,
  getActiveConnection,
  isConnectedToVoice,
  getMemberVoiceChannel,
} from "./voice-client.ts";

export { speakInChannel, isTTSEnabled, configureTTS } from "./tts-speaker.ts";

export { isWhisperConfigured } from "./transcription.ts";
