import {
  OPENAI_BASE_URL,
  OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT,
} from "../../constants";
import { Env } from "../../main";
import {
  assertEnvKey,
  makeApiRequest,
  downloadFile,
} from "@decocms/mcps-shared/tools/utils/api-client";
import {
  WhisperModel,
  TranscriptionResponseSchema,
  VerboseTranscriptionResponseSchema,
  type TranscriptionResponse,
  type VerboseTranscriptionResponse,
} from "./types";

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
  assertEnvKey(env, "OPENAI_API_KEY");

  const url = `${OPENAI_BASE_URL}${OPENAI_AUDIO_TRANSCRIPTIONS_ENDPOINT}`;

  const audioBlob = await downloadFile(audioUrl);

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

  const responseFormat = options?.responseFormat || "json";
  const isJsonFormat =
    responseFormat === "json" || responseFormat === "verbose_json";

  // Use makeApiRequest with appropriate response type
  if (isJsonFormat) {
    const data = await makeApiRequest(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: formData,
      },
      "OpenAI Whisper",
      "json",
    );

    console.log(`[transcribeAudio] Successfully transcribed audio`);

    if (responseFormat === "verbose_json") {
      return VerboseTranscriptionResponseSchema.parse(data);
    }
    return TranscriptionResponseSchema.parse(data);
  }

  // For text formats (text, srt, vtt), use text response type
  const text = await makeApiRequest<string>(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: formData,
    },
    "OpenAI Whisper",
    "text",
  );

  console.log(`[transcribeAudio] Successfully transcribed audio`);

  // Return text format as TranscriptionResponse
  return TranscriptionResponseSchema.parse({ text });
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
