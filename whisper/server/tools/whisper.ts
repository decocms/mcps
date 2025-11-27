import type { Env } from "../main";
import { createWhisperClient } from "./utils/whisper";
import {
  createAudioTranscriberTools,
  type TranscribeAudioInput,
} from "@decocms/mcps-shared/audio-transcribers";

export const whisperTools = createAudioTranscriberTools<Env>({
  metadata: {
    provider: "OpenAI Whisper",
    description: "Transcribe audio to text using OpenAI Whisper",
  },
  getContract: (env: Env) => ({
    binding: env.WHISPER_CONTRACT,
    clause: {
      clauseId: "whisper-1:transcribeAudio",
      amount: 1,
    },
  }),
  execute: async ({
    env,
    input,
  }: {
    env: Env;
    input: TranscribeAudioInput;
  }) => {
    const client = createWhisperClient(env);

    // Determine response format based on whether timestamps are requested
    const responseFormat = input.timestampGranularities
      ? "verbose_json"
      : input.responseFormat || "json";

    // Call Whisper API
    const response = await client.transcribeAudio(input.audioUrl, "whisper-1", {
      language: input.language,
      prompt: input.prompt,
      responseFormat,
      temperature: input.temperature,
      timestampGranularities: input.timestampGranularities,
    });

    // Handle verbose response with timestamps
    if ("duration" in response) {
      return {
        text: response.text,
        language: response.language,
        duration: response.duration,
        segments: response.segments,
        words: response.words,
      };
    }

    // Handle simple text response
    return {
      text: response.text,
    };
  },
});
