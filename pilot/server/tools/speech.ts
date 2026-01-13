/**
 * Speech Tools
 *
 * Tools for text-to-speech using macOS `say` command.
 */

import { spawn, type Subprocess } from "bun";
import type { Tool, ToolResult } from "./system.ts";

// Voice configuration
const DEFAULT_VOICE = "Samantha";
const PT_VOICE = "Luciana";
const EN_VOICE = "Samantha";

// Track active speech process
let activeSayProcess: Subprocess<"ignore", "pipe", "pipe"> | null = null;

/**
 * Detect language from text (simple heuristic)
 */
export function detectLanguage(text: string): "pt" | "en" {
  const ptPatterns = [
    /\b(você|voce|não|nao|está|esta|isso|esse|ela|ele|como|para|por|que|uma|um|com|são|sao|também|tambem|ainda|aqui|agora|onde|quando|porque|muito|bem|obrigado|olá|ola|bom|boa|dia|noite|tarde)\b/i,
    /[áàâãéêíóôõúç]/i,
  ];

  for (const pattern of ptPatterns) {
    if (pattern.test(text)) {
      return "pt";
    }
  }

  return "en";
}

/**
 * Get voice for a language
 */
export function getVoiceForLanguage(lang: "pt" | "en"): string {
  return lang === "pt" ? PT_VOICE : EN_VOICE;
}

/**
 * Stop any active speech
 */
export function stopSpeaking(): boolean {
  const processToKill = activeSayProcess;
  if (processToKill) {
    try {
      processToKill.kill();
      // Only clear if it's still the active process (no race condition)
      if (activeSayProcess === processToKill) {
        activeSayProcess = null;
      }
      return true;
    } catch {
      // Only clear if it's still the active process (no race condition)
      if (activeSayProcess === processToKill) {
        activeSayProcess = null;
      }
      return false;
    }
  }
  return false;
}

/**
 * Speak text aloud
 */
export async function speakText(
  text: string,
  voice?: string,
): Promise<{ success: boolean; voice: string }> {
  // Stop any current speech
  stopSpeaking();

  const detectedLang = detectLanguage(text);
  const selectedVoice = voice || getVoiceForLanguage(detectedLang);

  try {
    activeSayProcess = spawn(["say", "-v", selectedVoice, text], {
      stdout: "pipe",
      stderr: "pipe",
    });

    await activeSayProcess.exited;
    activeSayProcess = null;

    return { success: true, voice: selectedVoice };
  } catch (error) {
    activeSayProcess = null;
    throw error;
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * SAY_TEXT - Speak text aloud
 */
export const SAY_TEXT: Tool = {
  name: "SAY_TEXT",
  description:
    "Speak text aloud using text-to-speech. Auto-detects Portuguese vs English.",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Text to speak",
      },
      voice: {
        type: "string",
        description: "Voice to use (optional - auto-detects based on language)",
      },
    },
    required: ["text"],
  },
  execute: async (args): Promise<ToolResult> => {
    const text = args.text as string;
    const voice = args.voice as string | undefined;

    try {
      const result = await speakText(text, voice);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              voice: result.voice,
              textLength: text.length,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : "Speech failed",
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * STOP_SPEAKING - Stop any active speech
 */
export const STOP_SPEAKING: Tool = {
  name: "STOP_SPEAKING",
  description: "Stop any currently playing text-to-speech",
  inputSchema: {
    type: "object",
    properties: {},
  },
  execute: async (): Promise<ToolResult> => {
    const wasSpeaking = stopSpeaking();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            wasSpeaking,
            message: wasSpeaking ? "Stopped speaking" : "Nothing was playing",
          }),
        },
      ],
    };
  },
};

// Export all speech tools
export const speechTools: Tool[] = [SAY_TEXT, STOP_SPEAKING];
