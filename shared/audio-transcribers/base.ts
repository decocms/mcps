import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  applyMiddlewares,
  Contract,
  ContractClause,
  withLogging,
  withRetry,
  withTimeout,
} from "../video-generators/middleware";
import {
  TranscribeAudioInputSchema,
  TranscribeAudioOutputSchema,
  TranscribeAudioCallbackOutput,
  type TranscribeAudioInput,
} from "./schemas";

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
