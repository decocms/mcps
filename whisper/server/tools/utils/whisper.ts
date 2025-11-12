import {
  OPENAI_BASE_URL,
  OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT,
} from "../../constants";
import { Env } from "../../main";
import z from "zod";

// Whisper models
export const WhisperModels = z.enum(["whisper-1"]);

export type WhisperModel = z.infer<typeof WhisperModels>;

// Transcription response schema
export const TranscriptionResponseSchema = z.object({
  text: z.string().describe("The transcribed text"),
});

// Verbose transcription response schema (with timestamps)
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

export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;
export type VerboseTranscriptionResponse = z.infer<
  typeof VerboseTranscriptionResponseSchema
>;

/**
 * Assert that the OpenAI API key is set
 */
function assertApiKey(env: Env) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in environment");
  }
}

/**
 * Fetch audio file from URL
 */
async function fetchAudioFile(audioUrl: string): Promise<Blob> {
  console.log(
    `[fetchAudioFile] Fetching audio from: ${audioUrl.substring(0, 100)}...`,
  );

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch audio file: ${response.status} ${response.statusText}`,
    );
  }

  const blob = await response.blob();
  console.log(
    `[fetchAudioFile] Successfully fetched ${blob.size} bytes (${blob.type})`,
  );

  return blob;
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribeAudio(
  env: Env,
  audioUrl: string,
  model: WhisperModel = "whisper-1",
  options?: {
    language?: string;
    prompt?: string;
    responseFormat?: "json" | "text" | "srt" | "verbose_json" | "vtt";
    temperature?: number;
    timestampGranularities?: Array<"word" | "segment">;
  },
): Promise<TranscriptionResponse | VerboseTranscriptionResponse> {
  assertApiKey(env);

  const url = `${OPENAI_BASE_URL}${OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT}`;

  // Fetch the audio file
  const audioBlob = await fetchAudioFile(audioUrl);

  // Create form data
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.mp3");
  formData.append("model", model);

  if (options?.language) {
    formData.append("language", options.language);
  }

  if (options?.prompt) {
    formData.append("prompt", options.prompt);
  }

  if (options?.responseFormat) {
    formData.append("response_format", options.responseFormat);
  }

  if (options?.temperature !== undefined) {
    formData.append("temperature", options.temperature.toString());
  }

  if (
    options?.timestampGranularities &&
    options.timestampGranularities.length > 0
  ) {
    // For verbose_json format with timestamps
    options.timestampGranularities.forEach((granularity) => {
      formData.append("timestamp_granularities[]", granularity);
    });
  }

  console.log(`[transcribeAudio] Sending request to Whisper API`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();

    try {
      const errorJson = JSON.parse(errorText);
      const errorMessage = errorJson.error?.message || errorText;
      throw new Error(errorMessage);
    } catch {
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}\n${errorText}`,
      );
    }
  }

  const data = await response.json();

  console.log(`[transcribeAudio] Successfully transcribed audio`);

  // Parse response based on format
  if (options?.responseFormat === "verbose_json") {
    return VerboseTranscriptionResponseSchema.parse(data);
  }

  return TranscriptionResponseSchema.parse(data);
}

/**
 * Convenience function to create Whisper client
 */
export const createWhisperClient = (env: Env) => ({
  transcribeAudio: (
    audioUrl: string,
    model?: WhisperModel,
    options?: {
      language?: string;
      prompt?: string;
      responseFormat?: "json" | "text" | "srt" | "verbose_json" | "vtt";
      temperature?: number;
      timestampGranularities?: Array<"word" | "segment">;
    },
  ) => transcribeAudio(env, audioUrl, model, options),
});
