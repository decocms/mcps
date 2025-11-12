import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  applyMiddlewares,
  Contract,
  ContractClause,
  withLogging,
  withRetry,
  withTimeout,
} from "../video-generators/middleware";

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

export interface TranscribeAudioCallbackOutputError {
  error: true;
  /**
   * The finish reason of the transcription
   */
  finishReason?: string;
}

type TranscribeAudioCallbackOutput =
  | TranscribeAudioCallbackOutputSuccess
  | TranscribeAudioCallbackOutputError;

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

export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;
export type TranscribeAudioOutput = z.infer<typeof TranscribeAudioOutputSchema>;

export interface AudioTranscriberEnv {
  DECO_REQUEST_CONTEXT: {
    ensureAuthenticated: () => any;
  };
  DECO_CHAT_WORKSPACE: string;
}

export interface CreateAudioTranscriberOptions<
  TEnv extends AudioTranscriberEnv,
> {
  metadata: {
    provider: string;
    description?: string;
  };
  execute: ({
    env,
    input,
  }: {
    env: TEnv;
    input: TranscribeAudioInput;
  }) => Promise<TranscribeAudioCallbackOutput>;
  getContract: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

const MAX_TRANSCRIPTION_RETRIES = 3;
const MAX_TRANSCRIPTION_TIMEOUT_MS = 300_000; // 5 minutes for audio transcription

export function createAudioTranscriberTools<TEnv extends AudioTranscriberEnv>(
  options: CreateAudioTranscriberOptions<TEnv>,
) {
  const transcribeAudio = (env: TEnv) =>
    createPrivateTool({
      id: "TRANSCRIBE_AUDIO",
      description:
        options.metadata.description ||
        `Transcribe audio using ${options.metadata.provider}`,
      inputSchema: TranscribeAudioInputSchema,
      outputSchema: TranscribeAudioOutputSchema,
      execute: async ({ context }: { context: TranscribeAudioInput }) => {
        const doExecute = async () => {
          const contract = options.getContract(env);

          const { transactionId } = await contract.binding.CONTRACT_AUTHORIZE({
            clauses: [
              {
                clauseId: contract.clause.clauseId,
                amount: contract.clause.amount,
              },
            ],
          });

          const result = await options.execute({ env, input: context });

          if ("error" in result) {
            return {
              error: true,
              finishReason: result.finishReason,
            };
          }

          await contract.binding.CONTRACT_SETTLE({
            transactionId,
            clauses: [
              {
                clauseId: contract.clause.clauseId,
                amount: contract.clause.amount,
              },
            ],
            vendorId: env.DECO_CHAT_WORKSPACE,
          });

          return {
            text: result.text,
            language: result.language,
            duration: result.duration,
            segments: result.segments,
            words: result.words,
          };
        };

        const withMiddlewares = applyMiddlewares({
          fn: doExecute,
          middlewares: [
            withLogging({
              title: options.metadata.provider,
              startMessage: "Starting audio transcription...",
            }),
            withRetry(MAX_TRANSCRIPTION_RETRIES),
            withTimeout(MAX_TRANSCRIPTION_TIMEOUT_MS),
          ],
        });

        return withMiddlewares();
      },
    });

  return [transcribeAudio];
}
