import { z } from "zod";

/**
 * Input schema for audio transcription
 */
export const TranscribeAudioInputSchema = z.object({
  audioUrl: z.string().describe("URL of the audio file to transcribe"),
  language: z
    .string()
    .optional()
    .describe(
      "Language code (e.g., 'en', 'pt', 'es'). Auto-detected if not provided",
    ),
  prompt: z
    .string()
    .optional()
    .describe("Optional prompt to guide the transcription style"),
  responseFormat: z
    .enum(["json", "text", "srt", "verbose_json", "vtt"])
    .optional()
    .default("json")
    .describe("Format of the transcription response"),
  temperature: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Sampling temperature between 0 and 1"),
  timestampGranularities: z
    .array(z.enum(["word", "segment"]))
    .optional()
    .describe("Timestamp granularities for verbose_json format"),
});

/**
 * Success output for transcription callback
 */
export interface TranscribeAudioCallbackOutputSuccess {
  /**
   * The transcribed text
   */
  text: string;
  /**
   * Optional language detected
   */
  language?: string;
  /**
   * Optional duration in seconds
   */
  duration?: number;
  /**
   * Optional segments with timestamps
   */
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
  /**
   * Optional words with timestamps
   */
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}

/**
 * Error output for transcription callback
 */
export interface TranscribeAudioCallbackOutputError {
  error: true;
  /**
   * The finish reason of the transcription
   */
  finishReason?: string;
}

/**
 * Union type for transcription callback output
 */
export type TranscribeAudioCallbackOutput =
  | TranscribeAudioCallbackOutputSuccess
  | TranscribeAudioCallbackOutputError;

/**
 * Output schema for audio transcription tool
 */
export const TranscribeAudioOutputSchema = z.object({
  text: z.string().optional().describe("The transcribed text"),
  language: z.string().optional().describe("Detected language"),
  duration: z.number().optional().describe("Audio duration in seconds"),
  segments: z
    .array(
      z.object({
        id: z.number(),
        start: z.number(),
        end: z.number(),
        text: z.string(),
      }),
    )
    .optional()
    .describe("Transcription segments with timestamps"),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .optional()
    .describe("Individual words with timestamps"),
  error: z.boolean().optional().describe("Whether the request failed"),
  finishReason: z.string().optional().describe("Native finish reason"),
});

/**
 * Inferred types from schemas
 */
export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;
export type TranscribeAudioOutput = z.infer<typeof TranscribeAudioOutputSchema>;
