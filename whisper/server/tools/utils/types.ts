import z from "zod";

/**
 * Supported Whisper models
 */
export const WhisperModels = z.enum(["whisper-1"]);

export type WhisperModel = z.infer<typeof WhisperModels>;

/**
 * Simple transcription response schema
 */
export const TranscriptionResponseSchema = z.object({
  text: z.string().describe("The transcribed text"),
});

/**
 * Verbose transcription response schema with timestamps and metadata
 */
export const VerboseTranscriptionResponseSchema = z.object({
  task: z.string().optional(),
  language: z.string().optional(),
  duration: z.number().optional(),
  text: z.string(),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .optional(),
  segments: z
    .array(
      z.object({
        id: z.number(),
        seek: z.number().optional(),
        start: z.number(),
        end: z.number(),
        text: z.string(),
        tokens: z.array(z.number()).optional(),
        temperature: z.number().optional(),
        avg_logprob: z.number().optional(),
        compression_ratio: z.number().optional(),
        no_speech_prob: z.number().optional(),
      }),
    )
    .optional(),
});

/**
 * Inferred types from schemas
 */
export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;
export type VerboseTranscriptionResponse = z.infer<
  typeof VerboseTranscriptionResponseSchema
>;
