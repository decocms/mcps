/**
 * Voice Commands Module
 *
 * Integrates the full voice command flow:
 * Speech (User) -> STT (Whisper) -> LLM -> TTS (Response)
 *
 * Also handles sending responses via DM if configured.
 */

import type {
  Guild,
  User,
  VoiceChannel,
  Client,
  DMChannel,
  TextChannel,
} from "discord.js";
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
  pauseListening,
  resumeListening,
  type CompletedAudio,
} from "./audio-receiver.ts";
import {
  transcribeAudioBase64,
  configureWhisperSTT,
  isWhisperConfigured,
} from "./transcription.ts";

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
  enabled: true, // Voice enabled by default
  responseMode: "voice",
  ttsEnabled: true,
  ttsLanguage: "pt-BR",
  silenceThresholdMs: 1000,
};

let discordClient: Client | null = null;
let commandHandler: VoiceCommandHandler | null = null;

// ElevenLabs TTS configuration (using SDK directly)
let elevenlabsConfig: {
  apiKey: string;
  voiceId: string;
} | null = null;

// Track active voice sessions (includes text channel for TTS)
const activeSessions = new Map<
  string,
  {
    guildId: string;
    channelId: string;
    textChannelId?: string;
    startedAt: Date;
    lastActivity: Date;
  }
>();

/**
 * Send a TTS message using Discord's native TTS
 * This is much simpler than generating audio - Discord reads it aloud
 */
async function sendTTSMessage(
  guildId: string,
  message: string,
): Promise<boolean> {
  const session = activeSessions.get(guildId);
  if (!session?.textChannelId) {
    console.warn("[VoiceCommands] ⚠️ No text channel configured for TTS");
    return false;
  }

  if (!discordClient) {
    console.warn("[VoiceCommands] ⚠️ Discord client not available for TTS");
    return false;
  }

  try {
    console.log(
      `[VoiceCommands] 🔊 Sending TTS to channel ${session.textChannelId}: "${message.substring(0, 50)}..."`,
    );

    const channel = await discordClient.channels.fetch(session.textChannelId);
    if (!channel || !("send" in channel)) {
      console.error(
        "[VoiceCommands] ❌ Channel not found or not a text channel",
      );
      return false;
    }

    // Discord TTS has 2000 char limit - truncate if needed
    const truncated =
      message.length > 1900 ? message.substring(0, 1900) + "..." : message;

    await (channel as TextChannel).send({
      content: truncated,
      tts: true, // Discord native TTS!
    });

    console.log("[VoiceCommands] ✅ TTS message sent successfully");
    return true;
  } catch (error) {
    console.error("[VoiceCommands] ❌ TTS message error:", error);
    return false;
  }
}

/**
 * Send TTS audio using ElevenLabs SDK
 * Generates high-quality audio and uploads to Discord
 */
async function sendTTSWithElevenLabs(
  guildId: string,
  message: string,
): Promise<boolean> {
  if (!elevenlabsConfig) {
    console.warn("[VoiceCommands] ⚠️ ElevenLabs not configured");
    return false;
  }

  const session = activeSessions.get(guildId);
  if (!session?.textChannelId) {
    console.warn("[VoiceCommands] ⚠️ No text channel configured for TTS");
    return false;
  }

  if (!discordClient) {
    console.warn("[VoiceCommands] ⚠️ Discord client not available");
    return false;
  }

  try {
    console.log(
      `[VoiceCommands] 🎙️ Generating ElevenLabs TTS: "${message.substring(0, 50)}..."`,
    );

    // Import ElevenLabs SDK
    const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");

    // Create client with API key
    const client = new ElevenLabsClient({
      apiKey: elevenlabsConfig.apiKey,
    });

    // Generate audio
    const audio = await client.textToSpeech.convert(elevenlabsConfig.voiceId, {
      text: message,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
    });

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of audio) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    console.log(
      `[VoiceCommands] 🎙️ Generated ${audioBuffer.length} bytes of audio`,
    );

    // Send audio to Discord channel
    const channel = await discordClient.channels.fetch(session.textChannelId);
    if (!channel || !("send" in channel)) {
      console.error(
        "[VoiceCommands] ❌ Channel not found or not a text channel",
      );
      return false;
    }

    await (channel as TextChannel).send({
      files: [
        {
          attachment: audioBuffer,
          name: "tts.mp3",
          description: "ElevenLabs TTS Audio",
        },
      ],
    });

    console.log("[VoiceCommands] ✅ ElevenLabs TTS sent successfully");
    return true;
  } catch (error) {
    console.error("[VoiceCommands] ❌ ElevenLabs TTS error:", error);
    return false;
  }
}

/**
 * Send TTS - uses ElevenLabs if configured, otherwise Discord native
 */
async function sendTTS(guildId: string, message: string): Promise<boolean> {
  console.log("[VoiceCommands] DEBUG - sendTTS called:", {
    guildId,
    messageLength: message.length,
    hasElevenlabs: !!elevenlabsConfig,
  });

  if (elevenlabsConfig) {
    console.log("[VoiceCommands] DEBUG - Trying ElevenLabs");
    const success = await sendTTSWithElevenLabs(guildId, message);
    if (success) {
      console.log("[VoiceCommands] DEBUG - ElevenLabs success");
      return true;
    }
    // Fallback to Discord native if ElevenLabs fails
    console.log("[VoiceCommands] Falling back to Discord native TTS");
  } else {
    console.log("[VoiceCommands] DEBUG - No ElevenLabs, using Discord native");
  }
  return sendTTSMessage(guildId, message);
}

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

  console.log("[VoiceCommands] Configured:", voiceConfig);
  console.log("[VoiceCommands] Using Discord native TTS (no FFmpeg needed)");
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
 * Configure ElevenLabs for TTS (using SDK directly)
 */
export function configureElevenLabs(config: {
  apiKey: string;
  voiceId: string;
}): void {
  elevenlabsConfig = config;
  console.log("[VoiceCommands] ElevenLabs TTS configured:", {
    voiceId: config.voiceId,
    hasApiKey: !!config.apiKey,
  });
}

/**
 * Check if ElevenLabs is configured
 */
export function isElevenLabsConfigured(): boolean {
  return elevenlabsConfig !== null;
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
 * @param textChannelId - Optional text channel ID for TTS responses
 */
export async function startVoiceSession(
  channel: VoiceChannel,
  guild: Guild,
  textChannelId?: string,
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

    // Track session (include text channel for TTS)
    activeSessions.set(guild.id, {
      guildId: guild.id,
      channelId: channel.id,
      textChannelId,
      startedAt: new Date(),
      lastActivity: new Date(),
    });

    // Say greeting via TTS
    if (voiceConfig.ttsEnabled && textChannelId) {
      await sendTTS(guild.id, "Olá! Estou ouvindo no canal de voz.");
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
  // Say goodbye via TTS before leaving
  if (voiceConfig.ttsEnabled) {
    await sendTTS(guildId, "Até logo! Saindo do canal de voz.");
  }

  // Clean up
  clearAllBuffers();
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

  // Pause listening while processing to prevent overlapping commands
  pauseListening();

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
      resumeListening();
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
      // Don't resume listening - we're leaving
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
      resumeListening();
      return;
    }

    console.log(
      `[VoiceCommands] 🤖 Response: "${response.substring(0, 100)}${response.length > 100 ? "..." : ""}"`,
    );

    console.log("[VoiceCommands] DEBUG - Voice config:", {
      responseMode: voiceConfig.responseMode,
      ttsEnabled: voiceConfig.ttsEnabled,
      guildId,
      hasResponse: !!response,
    });

    // Respond based on mode
    if (
      voiceConfig.responseMode === "voice" ||
      voiceConfig.responseMode === "both"
    ) {
      console.log("[VoiceCommands] DEBUG - Entering voice response block");
      // Respond via TTS (ElevenLabs if configured, otherwise Discord native)
      if (voiceConfig.ttsEnabled) {
        console.log("[VoiceCommands] DEBUG - About to call sendTTS");
        await sendTTS(guildId, response);
        console.log("[VoiceCommands] DEBUG - sendTTS completed");
      } else {
        console.log("[VoiceCommands] DEBUG - TTS disabled, skipping");
      }
    } else {
      console.log(
        "[VoiceCommands] DEBUG - Skipping voice response, mode:",
        voiceConfig.responseMode,
      );
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

    // Try to speak error message via TTS
    if (voiceConfig.ttsEnabled) {
      await sendTTS(
        guildId,
        "Desculpe, ocorreu um erro ao processar seu comando.",
      );
    }
  } finally {
    // Always resume listening after processing (unless we're leaving)
    if (activeSessions.has(guildId)) {
      // Small delay after TTS to avoid capturing the bot's own audio
      await new Promise((resolve) => setTimeout(resolve, 500));
      resumeListening();
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

  // Find a text channel to send TTS messages to
  // Try to find a text channel with the same name as the voice channel, or use the first available text channel
  let textChannelId: string | undefined;

  const textChannels = guild.channels.cache.filter(
    (c) => c.type === 0, // 0 = GUILD_TEXT
  );

  // Try to find a text channel with the same name
  const matchingChannel = textChannels.find(
    (c) => c.name === channel.name || c.name === `${channel.name}-text`,
  );

  if (matchingChannel) {
    textChannelId = matchingChannel.id;
    console.log(
      `[VoiceCommands] Using matching text channel: ${matchingChannel.name}`,
    );
  } else if (textChannels.size > 0) {
    // Use the first available text channel
    const firstChannel = textChannels.first();
    if (firstChannel) {
      textChannelId = firstChannel.id;
      console.log(
        `[VoiceCommands] Using first available text channel: ${firstChannel.name}`,
      );
    }
  }

  if (!textChannelId) {
    console.warn(
      "[VoiceCommands] ⚠️ No text channel found in guild - TTS will not work",
    );
  }

  return startVoiceSession(channel, guild, textChannelId);
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

export { isWhisperConfigured } from "./transcription.ts";

/**
 * Check if TTS is enabled (using Discord native TTS)
 */
export function isTTSEnabled(): boolean {
  return voiceConfig.ttsEnabled;
}

/**
 * Configure TTS settings (for Discord native TTS)
 */
export function configureTTS(config: {
  enabled: boolean;
  language?: string;
}): void {
  voiceConfig.ttsEnabled = config.enabled;
  if (config.language) {
    voiceConfig.ttsLanguage = config.language;
  }
}
