/**
 * Google Cloud Speech APIs Client
 * Handles Text-to-Speech and Speech-to-Text API calls
 */
import { Buffer } from "node:buffer";
import { z } from "zod";
import type { Env } from "../main.ts";
import {
  makeApiRequest,
  downloadFile,
} from "@decocms/mcps-shared/tools/utils/api-client";
import {
  TEXT_TO_SPEECH_BASE_URL,
  SPEECH_TO_TEXT_BASE_URL,
  DEFAULT_LANGUAGE,
  DEFAULT_VOICE_NAME,
  DEFAULT_AUDIO_ENCODING,
} from "../constants.ts";

// Zod schemas for validation
const SynthesizeSpeechResponseSchema = z.object({
  audioContent: z.string(),
  audioConfig: z
    .object({
      audioEncoding: z.string(),
      sampleRateHertz: z.number(),
      effectiveChannel: z.number().optional(),
    })
    .optional(),
});

export type SynthesizeSpeechResponse = z.infer<
  typeof SynthesizeSpeechResponseSchema
>;

const RecognizeSpeechResponseSchema = z.object({
  results: z
    .array(
      z.object({
        alternatives: z.array(
          z.object({
            transcript: z.string(),
            confidence: z.number(),
            words: z
              .array(
                z.object({
                  word: z.string(),
                  startTime: z.string(),
                  endTime: z.string(),
                  confidence: z.number(),
                }),
              )
              .optional(),
          }),
        ),
        isFinal: z.boolean(),
      }),
    )
    .optional(),
  totalBilledTime: z.string().optional(),
  speechAdaptationResults: z.unknown().optional(),
});

export type RecognizeSpeechResponse = z.infer<
  typeof RecognizeSpeechResponseSchema
>;

/**
 * Makes a request to Google Text-to-Speech API
 */
async function makeTextToSpeechRequest(
  env: Env,
  body: unknown,
): Promise<SynthesizeSpeechResponse> {
  console.log("env.state", env.state);
  const apiKey = (env.state as any).GOOGLE_API_KEY;
  console.log("apiKey", apiKey);
  if (!apiKey) {
    throw new Error("Google Cloud API Key is not configured");
  }

  const url = `${TEXT_TO_SPEECH_BASE_URL}:synthesizeSpeech?key=${apiKey}`;

  const data = await makeApiRequest<SynthesizeSpeechResponse>(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    "Google Text-to-Speech API",
  );

  return SynthesizeSpeechResponseSchema.parse(data);
}

/**
 * Makes a request to Google Speech-to-Text API
 */
async function makeSpeechToTextRequest(
  env: Env,
  body: unknown,
): Promise<RecognizeSpeechResponse> {
  const apiKey = (env.state as any).GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Google Cloud API Key is not configured");
  }

  const url = `${SPEECH_TO_TEXT_BASE_URL}:recognize?key=${apiKey}`;

  const data = await makeApiRequest<RecognizeSpeechResponse>(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    "Google Speech-to-Text API",
  );

  return RecognizeSpeechResponseSchema.parse(data);
}

/**
 * Synthesizes speech from text using Google Cloud Text-to-Speech
 */
export async function synthesizeSpeech(
  env: Env,
  text: string,
  languageCode: string = DEFAULT_LANGUAGE,
  voiceName: string = DEFAULT_VOICE_NAME,
  audioEncoding: string = DEFAULT_AUDIO_ENCODING,
  speakingRate: number = 1.0,
  pitch: number = 0.0,
): Promise<SynthesizeSpeechResponse> {
  if (!text || text.trim().length === 0) {
    throw new Error("Text input is required and cannot be empty");
  }

  if (text.length > 5000) {
    throw new Error("Text input exceeds maximum length of 5000 characters");
  }

  const body = {
    input: {
      text,
    },
    voice: {
      languageCode,
      name: voiceName,
    },
    audioConfig: {
      audioEncoding,
      speakingRate,
      pitch,
    },
  };

  return await makeTextToSpeechRequest(env, body);
}

/**
 * Recognizes speech from audio using Google Cloud Speech-to-Text
 */
export async function recognizeSpeech(
  env: Env,
  audioUrl: string,
  languageCode: string = DEFAULT_LANGUAGE,
  model: string = "default",
  enableAutomaticPunctuation: boolean = true,
  enableWordTimeOffsets: boolean = false,
): Promise<RecognizeSpeechResponse> {
  if (!audioUrl || audioUrl.trim().length === 0) {
    throw new Error("Audio URL is required");
  }

  // Download the audio file
  console.log(`[recognizeSpeech] Downloading audio from: ${audioUrl}`);
  const audioBlob = await downloadFile(audioUrl);

  // Convert to base64
  const arrayBuffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  let base64Audio: string;
  if (typeof Buffer !== "undefined") {
    base64Audio = Buffer.from(bytes).toString("base64");
  } else {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64Audio = btoa(binary);
  }

  // Determine audio encoding from blob type
  let audioEncoding = "LINEAR16";
  const mimeType = audioBlob.type;
  if (mimeType.includes("mp3")) {
    audioEncoding = "MP3";
  } else if (mimeType.includes("ogg")) {
    audioEncoding = "OGG_OPUS";
  } else if (mimeType.includes("wav")) {
    audioEncoding = "LINEAR16";
  }

  const body = {
    config: {
      encoding: audioEncoding,
      languageCode,
      model,
      enableAutomaticPunctuation,
      enableWordTimeOffsets,
      maxAlternatives: 1,
    },
    audio: {
      content: base64Audio,
    },
  };

  return makeSpeechToTextRequest(env, body);
}

/**
 * Factory function to create a Google Speech client
 */
export const createGoogleSpeechClient = (env: Env) => ({
  synthesizeSpeech: (
    text: string,
    languageCode?: string,
    voiceName?: string,
    audioEncoding?: string,
    speakingRate?: number,
    pitch?: number,
  ) =>
    synthesizeSpeech(
      env,
      text,
      languageCode,
      voiceName,
      audioEncoding,
      speakingRate,
      pitch,
    ),
  recognizeSpeech: (
    audioUrl: string,
    languageCode?: string,
    model?: string,
    enableAutomaticPunctuation?: boolean,
    enableWordTimeOffsets?: boolean,
  ) =>
    recognizeSpeech(
      env,
      audioUrl,
      languageCode,
      model,
      enableAutomaticPunctuation,
      enableWordTimeOffsets,
    ),
});
