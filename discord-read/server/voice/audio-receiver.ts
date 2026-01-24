/**
 * Audio Receiver Module
 *
 * Captures audio from users in voice channels.
 * Buffers audio until silence is detected, then sends for transcription.
 */

import { EndBehaviorType, type VoiceConnection } from "@discordjs/voice";
import { Transform } from "stream";
import type { User } from "discord.js";

// ============================================================================
// Types
// ============================================================================

export interface AudioBuffer {
  userId: string;
  username: string;
  chunks: Buffer[];
  startTime: number;
  lastChunkTime: number;
}

export interface CompletedAudio {
  userId: string;
  username: string;
  audioBuffer: Buffer;
  duration: number; // milliseconds
}

export type AudioCompleteCallback = (audio: CompletedAudio) => Promise<void>;

// ============================================================================
// State
// ============================================================================

// Active audio buffers per user
const audioBuffers = new Map<string, AudioBuffer>();

// Registered callbacks
let onAudioComplete: AudioCompleteCallback | null = null;

// Configuration
const SILENCE_THRESHOLD_MS = 1500; // 1.5 seconds of silence before processing
const MAX_AUDIO_DURATION_MS = 60000; // 60 seconds max recording
const MIN_AUDIO_DURATION_MS = 500; // Minimum 0.5 seconds to process

// ============================================================================
// Audio Processing
// ============================================================================

/**
 * Register callback for when audio is complete
 */
export function setAudioCompleteCallback(
  callback: AudioCompleteCallback,
): void {
  onAudioComplete = callback;
}

/**
 * Start listening to a user's audio in a voice connection
 */
export function subscribeToUser(
  connection: VoiceConnection,
  userId: string,
  username: string,
): void {
  try {
    // Create audio stream for this user
    const audioStream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: SILENCE_THRESHOLD_MS,
      },
    });

    console.log(
      `[AudioReceiver] 🎤 Subscribed to user: ${username} (${userId})`,
    );

    // Initialize buffer for this user
    audioBuffers.set(userId, {
      userId,
      username,
      chunks: [],
      startTime: Date.now(),
      lastChunkTime: Date.now(),
    });

    // Collect audio chunks
    audioStream.on("data", (chunk: Buffer) => {
      const buffer = audioBuffers.get(userId);
      if (buffer) {
        buffer.chunks.push(chunk);
        buffer.lastChunkTime = Date.now();

        // Check if we've exceeded max duration
        const duration = Date.now() - buffer.startTime;
        if (duration > MAX_AUDIO_DURATION_MS) {
          console.log(`[AudioReceiver] Max duration reached for ${username}`);
          processCompletedAudio(userId);
        }
      }
    });

    // When stream ends (silence detected), process the audio
    audioStream.on("end", () => {
      console.log(`[AudioReceiver] Stream ended for ${username}`);
      processCompletedAudio(userId);
    });

    audioStream.on("error", (error) => {
      console.error(`[AudioReceiver] Error for ${username}:`, error);
      audioBuffers.delete(userId);
    });
  } catch (error) {
    console.error(`[AudioReceiver] Failed to subscribe to ${username}:`, error);
  }
}

/**
 * Process completed audio buffer
 */
async function processCompletedAudio(userId: string): Promise<void> {
  const buffer = audioBuffers.get(userId);
  if (!buffer || buffer.chunks.length === 0) {
    audioBuffers.delete(userId);
    return;
  }

  const duration = Date.now() - buffer.startTime;

  // Check minimum duration
  if (duration < MIN_AUDIO_DURATION_MS) {
    console.log(`[AudioReceiver] Audio too short (${duration}ms), ignoring`);
    audioBuffers.delete(userId);
    return;
  }

  // Combine all chunks
  const audioBuffer = Buffer.concat(buffer.chunks);
  console.log(
    `[AudioReceiver] ✅ Audio complete for ${buffer.username}: ${audioBuffer.length} bytes, ${duration}ms`,
  );

  // Clear the buffer
  audioBuffers.delete(userId);

  // Call the callback if registered
  if (onAudioComplete) {
    try {
      await onAudioComplete({
        userId: buffer.userId,
        username: buffer.username,
        audioBuffer,
        duration,
      });
    } catch (error) {
      console.error("[AudioReceiver] Error in audio complete callback:", error);
    }
  }
}

/**
 * Listen for all speaking events in a connection
 */
export function setupSpeakingListener(
  connection: VoiceConnection,
  getUserInfo: (userId: string) => Promise<User | null>,
): void {
  const receiver = connection.receiver;

  receiver.speaking.on("start", async (userId) => {
    // Check if already listening to this user
    if (audioBuffers.has(userId)) {
      // Reset the buffer timing
      const buffer = audioBuffers.get(userId)!;
      buffer.lastChunkTime = Date.now();
      return;
    }

    // Get user info
    const user = await getUserInfo(userId);
    if (!user) {
      console.log(`[AudioReceiver] Could not get user info for ${userId}`);
      return;
    }

    // Skip bots
    if (user.bot) {
      return;
    }

    console.log(`[AudioReceiver] 🗣️ ${user.username} started speaking`);

    // Subscribe to this user's audio
    subscribeToUser(connection, userId, user.username);
  });

  receiver.speaking.on("end", (userId) => {
    // The EndBehaviorType.AfterSilence handles this
    // But we can log it for debugging
    const buffer = audioBuffers.get(userId);
    if (buffer) {
      console.log(`[AudioReceiver] 🔇 ${buffer.username} stopped speaking`);
    }
  });

  console.log("[AudioReceiver] Speaking listener setup complete");
}

/**
 * Convert raw PCM audio to WAV format
 * Discord sends Opus-decoded PCM at 48kHz, 2 channels, 16-bit
 */
export function pcmToWav(pcmBuffer: Buffer): Buffer {
  const sampleRate = 48000;
  const numChannels = 2;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  // WAV header is 44 bytes
  const headerSize = 44;
  const wavBuffer = Buffer.alloc(headerSize + pcmBuffer.length);

  // RIFF header
  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4); // File size - 8
  wavBuffer.write("WAVE", 8);

  // fmt subchunk
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  wavBuffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  wavBuffer.writeUInt16LE(numChannels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(pcmBuffer.length, 40);

  // Copy PCM data
  pcmBuffer.copy(wavBuffer, 44);

  return wavBuffer;
}

/**
 * Create an Opus decoder transform stream
 * Note: This requires @discordjs/opus or opusscript to be installed
 */
export function createOpusDecoder(): Transform {
  // Discord.js voice already decodes Opus to PCM internally
  // This is a passthrough that collects the PCM data
  return new Transform({
    transform(chunk, _encoding, callback) {
      this.push(chunk);
      callback();
    },
  });
}

/**
 * Clear all audio buffers
 */
export function clearAllBuffers(): void {
  audioBuffers.clear();
  console.log("[AudioReceiver] All audio buffers cleared");
}

/**
 * Get current buffer count
 */
export function getActiveBufferCount(): number {
  return audioBuffers.size;
}
