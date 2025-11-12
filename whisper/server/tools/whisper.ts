import type { Env } from "../main";
import { createWhisperClient } from "./utils/whisper";
import {
  createAudioTranscriberTools,
  type TranscribeAudioInput,
} from "@decocms/mcps-shared/audio-transcribers";

// Mock contract binding for development until WHISPER_CONTRACT is configured
const mockContract = {
  CONTRACT_AUTHORIZE: async ({ clauses }: any) => {
    console.log("[MOCK CONTRACT] Authorize called with clauses:", clauses);
    return { transactionId: `mock-tx-${Date.now()}` };
  },
  CONTRACT_SETTLE: async ({ transactionId, clauses, vendorId }: any) => {
    console.log("[MOCK CONTRACT] Settle called:", {
      transactionId,
      clauses,
      vendorId,
    });
    return { success: true };
  },
};

export const whisperTools = createAudioTranscriberTools<Env>({
  metadata: {
    provider: "OpenAI Whisper",
    description: "Transcribe audio to text using OpenAI Whisper",
  },
  getContract: (env: Env) => ({
    // TODO: Replace with env.WHISPER_CONTRACT when configured in Deco
    binding: (env as any).WHISPER_CONTRACT || mockContract,
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
