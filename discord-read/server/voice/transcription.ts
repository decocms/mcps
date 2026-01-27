/**
 * Transcription Module
 *
 * Integrates with Whisper for Speech-to-Text (STT).
 * Converts audio from voice channels to text.
 */

import { pcmToWav, type CompletedAudio } from "./audio-receiver.ts";

// ============================================================================
// Types
// ============================================================================

export interface TranscriptionResult {
  userId: string;
  username: string;
  text: string;
  language?: string;
  duration: number;
}

export interface WhisperConfig {
  meshUrl: string;
  organizationId: string;
  token: string;
  whisperConnectionId: string;
}

// ============================================================================
// State
// ============================================================================

let whisperConfig: WhisperConfig | null = null;

// Temporary file storage for audio (Whisper needs a URL)
const tempAudioFiles = new Map<string, { data: Buffer; createdAt: number }>();
const TEMP_FILE_TTL_MS = 60000; // 1 minute

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configure Whisper connection
 */
export function configureWhisperSTT(config: WhisperConfig): void {
  whisperConfig = config;
  console.log("[Transcription] Whisper configured:", {
    meshUrl: config.meshUrl,
    organizationId: config.organizationId,
    whisperConnectionId: config.whisperConnectionId,
    hasToken: !!config.token,
  });
}

/**
 * Update only the token (used when refreshing from stored config)
 */
export function updateWhisperToken(token: string): void {
  if (whisperConfig) {
    whisperConfig.token = token;
    console.log("[Transcription] Whisper token updated");
  }
}

/**
 * Check if Whisper is configured
 */
export function isWhisperConfigured(): boolean {
  return whisperConfig !== null;
}

/**
 * Get effective token - uses stored config as fallback
 */
async function getEffectiveToken(): Promise<string | null> {
  if (whisperConfig?.token) {
    return whisperConfig.token;
  }

  // Try to get from stored config (has persistent API Key)
  try {
    const { getStoredConfig } = await import("../bot-manager.ts");
    const storedConfig = getStoredConfig();
    if (storedConfig?.persistentToken) {
      console.log("[Transcription] Using token from stored config");
      return storedConfig.persistentToken;
    }
  } catch {
    // bot-manager not available
  }

  return null;
}

// ============================================================================
// Temp File Storage (for Whisper URL access)
// ============================================================================

/**
 * Store audio temporarily and return an ID
 */
export function storeTempAudio(audioBuffer: Buffer): string {
  const id = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  tempAudioFiles.set(id, { data: audioBuffer, createdAt: Date.now() });

  // Clean up old files
  cleanupTempFiles();

  return id;
}

/**
 * Get temp audio by ID
 */
export function getTempAudio(id: string): Buffer | null {
  const file = tempAudioFiles.get(id);
  if (!file) return null;

  // Check if expired
  if (Date.now() - file.createdAt > TEMP_FILE_TTL_MS) {
    tempAudioFiles.delete(id);
    return null;
  }

  return file.data;
}

/**
 * Clean up expired temp files
 */
function cleanupTempFiles(): void {
  const now = Date.now();
  for (const [id, file] of tempAudioFiles) {
    if (now - file.createdAt > TEMP_FILE_TTL_MS) {
      tempAudioFiles.delete(id);
    }
  }
}

// ============================================================================
// Transcription
// ============================================================================

/**
 * Transcribe audio buffer using Whisper
 */
export async function transcribeAudio(
  audio: CompletedAudio,
  serverBaseUrl?: string,
): Promise<TranscriptionResult | null> {
  if (!whisperConfig) {
    console.log("[Transcription] Whisper not configured");
    return null;
  }

  // Get effective token (with fallback to stored config)
  const effectiveToken = await getEffectiveToken();
  if (!effectiveToken) {
    console.log("[Transcription] No valid token available");
    return null;
  }

  try {
    console.log(
      `[Transcription] Transcribing audio from ${audio.username} (${audio.audioBuffer.length} bytes, ${audio.duration}ms)`,
    );

    // Convert PCM to WAV
    const wavBuffer = pcmToWav(audio.audioBuffer);
    console.log(`[Transcription] Converted to WAV: ${wavBuffer.length} bytes`);

    // Store temporarily and create URL
    const tempId = storeTempAudio(wavBuffer);
    const audioUrl = serverBaseUrl
      ? `${serverBaseUrl}/temp-audio/${tempId}`
      : `data:audio/wav;base64,${wavBuffer.toString("base64")}`;

    // Use localhost for tunnel URLs
    const isTunnel = whisperConfig.meshUrl.includes(".deco.host");
    const effectiveMeshUrl = isTunnel
      ? "http://localhost:3000"
      : whisperConfig.meshUrl;

    // Call Whisper via MCP proxy
    const url = `${effectiveMeshUrl}/mcp/${whisperConfig.whisperConnectionId}`;

    console.log(`[Transcription] Calling Whisper: ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveToken}`,
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "TRANSCRIBE_AUDIO",
          arguments: {
            audioUrl,
            language: undefined, // Auto-detect
            responseFormat: "text",
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Transcription] Whisper failed: ${response.status} ${response.statusText}`,
      );
      console.error(`[Transcription] Error details:`, errorText);
      return null;
    }

    const result = (await response.json()) as {
      result?: {
        content?: Array<{ type: string; text?: string }>;
        text?: string;
      };
    };

    // Extract transcription
    let transcription: string | undefined;

    // Format 1: MCP content array
    if (result?.result?.content) {
      transcription = result.result.content.find(
        (c) => c.type === "text",
      )?.text;
    }

    // Format 2: Direct text
    if (!transcription && result?.result?.text) {
      const textResult = result.result.text;
      if (typeof textResult === "string" && textResult.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(textResult);
          transcription = parsed.text || textResult;
        } catch {
          transcription = textResult;
        }
      } else {
        transcription = textResult;
      }
    }

    if (transcription) {
      console.log(
        `[Transcription] ✅ Success: "${transcription.substring(0, 100)}${transcription.length > 100 ? "..." : ""}"`,
      );

      return {
        userId: audio.userId,
        username: audio.username,
        text: transcription.trim(),
        duration: audio.duration,
      };
    }

    console.warn("[Transcription] No transcription in response:", result);
    return null;
  } catch (error) {
    console.error("[Transcription] Error:", error);
    return null;
  }
}

/**
 * Transcribe audio using base64 directly (no server needed)
 */
export async function transcribeAudioBase64(
  audio: CompletedAudio,
): Promise<TranscriptionResult | null> {
  if (!whisperConfig) {
    console.log("[Transcription] Whisper not configured");
    return null;
  }

  // Get effective token (with fallback to stored config)
  const effectiveToken = await getEffectiveToken();
  if (!effectiveToken) {
    console.log("[Transcription] No valid token available");
    return null;
  }

  try {
    // Convert PCM to WAV
    const wavBuffer = pcmToWav(audio.audioBuffer);

    // Create data URI
    const audioDataUri = `data:audio/wav;base64,${wavBuffer.toString("base64")}`;

    console.log(
      `[Transcription] Transcribing ${audio.username}'s audio (${wavBuffer.length} bytes)`,
    );

    // Use localhost for tunnel URLs
    const isTunnel = whisperConfig.meshUrl.includes(".deco.host");
    const effectiveMeshUrl = isTunnel
      ? "http://localhost:3000"
      : whisperConfig.meshUrl;

    // Call Whisper via MCP proxy
    const url = `${effectiveMeshUrl}/mcp/${whisperConfig.whisperConnectionId}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveToken}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "TRANSCRIBE_AUDIO",
          arguments: {
            audioUrl: audioDataUri,
            responseFormat: "text",
          },
        },
      }),
    });

    if (!response.ok) {
      console.error(`[Transcription] Failed: ${response.status}`);
      return null;
    }

    const result = (await response.json()) as {
      result?: {
        content?: Array<{ type: string; text?: string }>;
        text?: string;
      };
    };

    // Extract transcription
    let transcription: string | undefined;

    if (result?.result?.content) {
      transcription = result.result.content.find(
        (c) => c.type === "text",
      )?.text;
    }

    if (!transcription && result?.result?.text) {
      transcription = result.result.text;
    }

    if (transcription) {
      console.log(`[Transcription] ✅ "${transcription.substring(0, 50)}..."`);

      return {
        userId: audio.userId,
        username: audio.username,
        text: transcription.trim(),
        duration: audio.duration,
      };
    }

    return null;
  } catch (error) {
    console.error("[Transcription] Error:", error);
    return null;
  }
}
