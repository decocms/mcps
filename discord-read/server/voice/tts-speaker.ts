/**
 * TTS Speaker Module
 *
 * Text-to-Speech (TTS) for responding via voice in Discord channels.
 * Supports Google TTS (free) as the default provider.
 */

import {
  createAudioResource,
  createAudioPlayer,
  AudioPlayerStatus,
  type VoiceConnection,
  StreamType,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import googleTTS from "google-tts-api";
import { Readable } from "stream";

// ============================================================================
// Types
// ============================================================================

export interface TTSConfig {
  enabled: boolean;
  language: string;
}

export interface SpeakOptions {
  language?: string;
  slow?: boolean;
}

// ============================================================================
// State
// ============================================================================

let ttsConfig: TTSConfig = {
  enabled: true,
  language: "pt-BR",
};

// Track active players to prevent overlapping
const activePlayers = new Map<string, ReturnType<typeof createAudioPlayer>>();

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configure TTS settings
 */
export function configureTTS(config: Partial<TTSConfig>): void {
  ttsConfig = { ...ttsConfig, ...config };
  console.log("[TTS] Configured:", ttsConfig);
}

/**
 * Check if TTS is enabled
 */
export function isTTSEnabled(): boolean {
  return ttsConfig.enabled;
}

/**
 * Get current TTS language
 */
export function getTTSLanguage(): string {
  return ttsConfig.language;
}

// ============================================================================
// TTS Functions
// ============================================================================

/**
 * Split text into chunks that fit Google TTS limit (200 chars)
 */
function splitTextForTTS(text: string, maxLength: number = 200): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at sentence boundaries
    let splitIndex = remaining.lastIndexOf(". ", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf("! ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf("? ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(", ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // No good split point found, hard cut at maxLength - 1 to stay within limit
      splitIndex = maxLength - 1;
    }

    // Include the punctuation in the chunk but ensure we don't exceed maxLength
    const chunkEnd = Math.min(splitIndex + 1, maxLength);
    const chunk = remaining.slice(0, chunkEnd).trim();
    chunks.push(chunk);
    remaining = remaining.slice(chunkEnd).trim();
  }

  return chunks;
}

/**
 * Get audio URL from Google TTS
 */
async function getGoogleTTSUrl(
  text: string,
  language: string,
  slow: boolean = false,
): Promise<string> {
  return googleTTS.getAudioUrl(text, {
    lang: language,
    slow,
    host: "https://translate.google.com",
  });
}

/**
 * Download audio from URL and return as buffer
 */
async function downloadAudio(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download TTS audio: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Play a single audio chunk
 */
async function playAudioChunk(
  connection: VoiceConnection,
  audioUrl: string,
  guildId: string,
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      // Download the audio
      const audioBuffer = await downloadAudio(audioUrl);

      // Create a readable stream from the buffer
      const stream = Readable.from(audioBuffer);

      // Create audio resource
      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      });

      // Set volume
      if (resource.volume) {
        resource.volume.setVolume(1.0);
      }

      // Get or create player
      let player = activePlayers.get(guildId);
      if (!player) {
        player = createAudioPlayer({
          behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
          },
        });
        activePlayers.set(guildId, player);
        connection.subscribe(player);
      }

      // Set up completion handlers
      const onIdle = () => {
        player?.off(AudioPlayerStatus.Idle, onIdle);
        player?.off("error", onError);
        resolve();
      };

      const onError = (error: Error) => {
        player?.off(AudioPlayerStatus.Idle, onIdle);
        player?.off("error", onError);
        reject(error);
      };

      player.on(AudioPlayerStatus.Idle, onIdle);
      player.on("error", onError);

      // Play
      player.play(resource);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Speak text in a voice channel
 */
export async function speakInChannel(
  connection: VoiceConnection,
  text: string,
  guildId: string,
  options: SpeakOptions = {},
): Promise<boolean> {
  if (!ttsConfig.enabled) {
    console.log("[TTS] TTS is disabled");
    return false;
  }

  const language = options.language || ttsConfig.language;
  const slow = options.slow || false;

  try {
    console.log(
      `[TTS] Speaking: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
    );

    // Split text into chunks
    const chunks = splitTextForTTS(text);
    console.log(`[TTS] Split into ${chunks.length} chunk(s)`);

    // Play each chunk sequentially
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(
        `[TTS] Playing chunk ${i + 1}/${chunks.length}: "${chunk.substring(0, 30)}..."`,
      );

      try {
        const audioUrl = await getGoogleTTSUrl(chunk, language, slow);
        await playAudioChunk(connection, audioUrl, guildId);
      } catch (error) {
        console.error(`[TTS] Error playing chunk ${i + 1}:`, error);
        // Continue with next chunk
      }
    }

    console.log("[TTS] ✅ Speech complete");
    return true;
  } catch (error) {
    console.error("[TTS] Error:", error);
    return false;
  }
}

/**
 * Stop any currently playing audio
 */
export function stopSpeaking(guildId: string): void {
  const player = activePlayers.get(guildId);
  if (player) {
    player.stop();
    console.log("[TTS] Stopped speaking");
  }
}

/**
 * Clean up players for a guild
 */
export function cleanupPlayer(guildId: string): void {
  const player = activePlayers.get(guildId);
  if (player) {
    player.stop();
    activePlayers.delete(guildId);
    console.log("[TTS] Player cleaned up for guild:", guildId);
  }
}

/**
 * Clean up all players
 */
export function cleanupAllPlayers(): void {
  for (const [guildId, player] of activePlayers) {
    player.stop();
    activePlayers.delete(guildId);
  }
  console.log("[TTS] All players cleaned up");
}

/**
 * Normalize audio to boost volume (prevent low volume issues)
 */
function normalizeAudio(input: Buffer, targetPeak: number = 28000): Buffer {
  const samplesIn = input.length / 2;

  // Find peak
  let peak = 0;
  for (let i = 0; i < samplesIn; i++) {
    const sample = Math.abs(input.readInt16LE(i * 2));
    peak = Math.max(peak, sample);
  }

  if (peak === 0) {
    console.warn("[TTS] Audio is silent (all zeros)");
    return input;
  }

  // Calculate amplification factor
  const amplification = targetPeak / peak;
  console.log(
    `[TTS] Normalizing: peak=${peak}, amplification=${amplification.toFixed(2)}x`,
  );

  // Apply amplification
  const output = Buffer.alloc(input.length);
  for (let i = 0; i < samplesIn; i++) {
    const sample = input.readInt16LE(i * 2);
    const amplified = Math.floor(sample * amplification);
    // Clamp to prevent clipping
    const clamped = Math.max(-32768, Math.min(32767, amplified));
    output.writeInt16LE(clamped, i * 2);
  }

  return output;
}

/**
 * Upsample PCM audio from 24kHz to 48kHz (required by Discord)
 * Uses linear interpolation for smoother audio
 */
function upsample24kTo48k(input: Buffer): Buffer {
  console.log(
    `[TTS] Upsampling: ${input.length} bytes input (${input.length / 2} samples)`,
  );

  // Input: 24kHz PCM 16-bit mono
  // Output: 48kHz PCM 16-bit stereo
  const samplesIn = input.length / 2; // 16-bit = 2 bytes per sample
  const samplesOut = samplesIn * 2; // 2x upsampling
  const output = Buffer.alloc(samplesOut * 2 * 2); // stereo (2 channels) * 2 bytes

  console.log(
    `[TTS] Upsampling output: ${output.length} bytes (${samplesOut} samples * 2 channels)`,
  );

  let outIdx = 0;
  let maxSample = 0;
  let minSample = 0;

  for (let i = 0; i < samplesIn; i++) {
    const sample1 = input.readInt16LE(i * 2);
    const sample2 =
      i < samplesIn - 1 ? input.readInt16LE((i + 1) * 2) : sample1;

    // Track min/max for debugging
    maxSample = Math.max(maxSample, Math.abs(sample1));
    minSample = Math.min(minSample, sample1);

    // Linear interpolation between sample1 and sample2
    const interpolated = Math.floor((sample1 + sample2) / 2);

    // Write sample1 (left and right)
    output.writeInt16LE(sample1, outIdx);
    output.writeInt16LE(sample1, outIdx + 2);
    outIdx += 4;

    // Write interpolated (left and right)
    output.writeInt16LE(interpolated, outIdx);
    output.writeInt16LE(interpolated, outIdx + 2);
    outIdx += 4;
  }

  console.log(
    `[TTS] Sample range: ${minSample} to ${maxSample} (max abs: ${maxSample})`,
  );

  return output;
}

/**
 * Play audio buffer (e.g., from ElevenLabs) in voice channel
 */
export async function playAudioBuffer(
  connection: VoiceConnection,
  audioBuffer: Buffer,
  guildId: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      console.log(`[TTS] DEBUG - Input buffer: ${audioBuffer.length} bytes`);

      // Check if buffer has actual data (not all zeros)
      const firstSamples = [];
      for (let i = 0; i < Math.min(10, audioBuffer.length / 2); i++) {
        firstSamples.push(audioBuffer.readInt16LE(i * 2));
      }
      console.log(`[TTS] DEBUG - First 10 samples:`, firstSamples);

      // Normalize audio to boost volume
      const normalized = normalizeAudio(audioBuffer);

      // Upsample from 24kHz to 48kHz and convert mono to stereo
      const upsampled = upsample24kTo48k(normalized);

      console.log(`[TTS] DEBUG - Output buffer: ${upsampled.length} bytes`);

      // Check upsampled output
      const firstUpsampled = [];
      for (let i = 0; i < Math.min(10, upsampled.length / 2); i++) {
        firstUpsampled.push(upsampled.readInt16LE(i * 2));
      }
      console.log(`[TTS] DEBUG - First 10 upsampled samples:`, firstUpsampled);

      // Create a readable stream from the upsampled buffer
      const stream = Readable.from(upsampled);

      // Create audio resource - PCM format doesn't need FFmpeg!
      const resource = createAudioResource(stream, {
        inputType: StreamType.Raw, // Raw PCM audio (48kHz, 16-bit, stereo)
        inlineVolume: false, // PCM doesn't support inline volume
      });

      // Get or create player
      let player = activePlayers.get(guildId);
      if (!player) {
        player = createAudioPlayer({
          behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
          },
        });
        activePlayers.set(guildId, player);
        connection.subscribe(player);
      }

      // Set up completion handlers
      const onIdle = () => {
        player?.off(AudioPlayerStatus.Idle, onIdle);
        player?.off("error", onError);
        console.log("[TTS] Audio playback completed");
        resolve(true);
      };

      const onError = (error: Error) => {
        player?.off(AudioPlayerStatus.Idle, onIdle);
        player?.off("error", onError);
        console.error("[TTS] Audio playback error:", error);
        reject(error);
      };

      player.on(AudioPlayerStatus.Idle, onIdle);
      player.on("error", onError);

      // Play
      player.play(resource);
    } catch (error) {
      console.error("[TTS] Failed to play audio buffer:", error);
      resolve(false);
    }
  });
}

/**
 * Quick greeting when joining a channel
 */
export async function sayGreeting(
  connection: VoiceConnection,
  guildId: string,
  language?: string,
): Promise<void> {
  const greetings: Record<string, string> = {
    "pt-BR": "Olá! Estou ouvindo. Pode falar.",
    "en-US": "Hello! I'm listening. Go ahead.",
    es: "¡Hola! Estoy escuchando. Adelante.",
  };

  const lang = language || ttsConfig.language;
  const greeting = greetings[lang] || greetings["en-US"];

  await speakInChannel(connection, greeting, guildId, { language: lang });
}

/**
 * Say goodbye when leaving
 */
export async function sayGoodbye(
  connection: VoiceConnection,
  guildId: string,
  language?: string,
): Promise<void> {
  const goodbyes: Record<string, string> = {
    "pt-BR": "Até mais!",
    "en-US": "Goodbye!",
    es: "¡Hasta luego!",
  };

  const lang = language || ttsConfig.language;
  const goodbye = goodbyes[lang] || goodbyes["en-US"];

  await speakInChannel(connection, goodbye, guildId, { language: lang });
}
