import { createPrivateTool } from "@decocms/runtime/mastra";
import { saveVideo } from "./storage";
import { ObjectStorage } from "../storage";
import {
  applyMiddlewares,
  Contract,
  ContractClause,
  withLogging,
  withRetry,
  withTimeout,
} from "./middleware";
import {
  GenerateVideoInputSchema,
  GenerateVideoOutputSchema,
  ListVideosInputSchema,
  ListVideosOutputSchema,
  ExtendVideoInputSchema,
  ExtendVideoOutputSchema,
} from "./schemas";
import type {
  GenerateVideoInput,
  ListVideosInput,
  ListVideosOutput,
  ExtendVideoInput,
} from "./schemas";

export type VideoGeneratorStorage = Pick<
  ObjectStorage,
  "createPresignedReadUrl" | "createPresignedPutUrl"
>;

export interface GenerateVideoCallbackOutputSuccess {
  /**
   * The video data as Blob, ArrayBuffer, or ReadableStream for streaming
   */
  data: Blob | ArrayBuffer | ReadableStream;
  /**
   * The mime type of the video
   */
  mimeType?: string;
  /**
   * Optional operation name for tracking
   */
  operationName?: string;
}

export interface GenerateVideoCallbackOutputError {
  error: true;
  /**
   * The finish reason of the video generation
   */
  finishReason?: string;
}

type GenerateVideoCallbackOutput =
  | GenerateVideoCallbackOutputSuccess
  | GenerateVideoCallbackOutputError;

export interface ExtendVideoCallbackOutputSuccess {
  /**
   * The video data as Blob, ArrayBuffer, or ReadableStream for streaming
   */
  data: Blob | ArrayBuffer | ReadableStream;
  /**
   * The mime type of the video
   */
  mimeType?: string;
  /**
   * Optional operation name for tracking
   */
  operationName?: string;
}

export interface ExtendVideoCallbackOutputError {
  error: true;
  /**
   * The finish reason of the video extension
   */
  finishReason?: string;
}

export type ExtendVideoCallbackOutput =
  | ExtendVideoCallbackOutputSuccess
  | ExtendVideoCallbackOutputError;

export interface VideoGeneratorEnv {
  DECO_REQUEST_CONTEXT: {
    ensureAuthenticated: () => any;
  };
  DECO_CHAT_WORKSPACE: string;
}

/**
 * Configuration for generate video tool
 */
export interface GenerateToolConfig<
  TEnv extends VideoGeneratorEnv,
  TClient = unknown,
> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: GenerateVideoInput;
    client: TClient;
  }) => Promise<GenerateVideoCallbackOutput>;
  getContract: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

/**
 * Configuration for list videos tool
 */
export interface ListToolConfig<
  TEnv extends VideoGeneratorEnv,
  TClient = unknown,
> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: ListVideosInput;
    client: TClient;
  }) => Promise<ListVideosOutput>;
  getContract?: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

/**
 * Configuration for extend video tool
 */
export interface ExtendToolConfig<
  TEnv extends VideoGeneratorEnv,
  TClient = unknown,
> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: ExtendVideoInput;
    client: TClient;
  }) => Promise<ExtendVideoCallbackOutput>;
  getContract?: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

export interface CreateVideoGeneratorOptions<
  TEnv extends VideoGeneratorEnv,
  TClient = unknown,
> {
  metadata: {
    provider: string;
    description?: string;
  };
  getStorage: (env: TEnv) => VideoGeneratorStorage;
  getClient?: (env: TEnv) => TClient;
  generateTool: GenerateToolConfig<TEnv, TClient>;
  listTool?: ListToolConfig<TEnv, TClient>;
  extendTool?: ExtendToolConfig<TEnv, TClient>;
}

const MAX_VIDEO_GEN_RETRIES = 3;
const MAX_VIDEO_GEN_TIMEOUT_MS = 360_000; // 6 minutes for video generation

export function createVideoGeneratorTools<
  TEnv extends VideoGeneratorEnv,
  TClient = unknown,
>(options: CreateVideoGeneratorOptions<TEnv, TClient>) {
  const generateVideo = (env: TEnv) =>
    createPrivateTool({
      id: "GENERATE_VIDEO",
      description:
        options.metadata.description ||
        `Generate videos using ${options.metadata.provider}`,
      inputSchema: GenerateVideoInputSchema,
      outputSchema: GenerateVideoOutputSchema,
      execute: async ({ context }: { context: GenerateVideoInput }) => {
        const doExecute = async () => {
          const contract = options.generateTool.getContract(env);

          const { transactionId } = await contract.binding.CONTRACT_AUTHORIZE({
            clauses: [
              {
                clauseId: contract.clause.clauseId,
                amount: contract.clause.amount,
              },
            ],
          });

          const client = options.getClient?.(env) as TClient;
          const result = await options.generateTool.execute({
            env,
            input: context,
            client,
          });

          if ("error" in result) {
            return {
              error: true,
              finishReason: result.finishReason,
            };
          }

          const storage = options.getStorage(env);
          const saveVideoResult = await saveVideo(storage, {
            videoData: result.data,
            mimeType: result.mimeType || "video/mp4",
            metadata: {
              prompt: context.prompt,
              ...(result.operationName && {
                operationName: result.operationName,
              }),
            },
          });

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
            video: saveVideoResult.url,
            operationName: result.operationName,
          };
        };

        const withMiddlewares = applyMiddlewares({
          fn: doExecute,
          middlewares: [
            withLogging({
              title: options.metadata.provider,
              startMessage: "Starting video generation...",
            }),
            withRetry(MAX_VIDEO_GEN_RETRIES),
            withTimeout(MAX_VIDEO_GEN_TIMEOUT_MS),
          ],
        });

        return withMiddlewares();
      },
    });

  const listVideos = options.listTool
    ? (env: TEnv) =>
        createPrivateTool({
          id: "LIST_VIDEOS",
          description: `List videos generated with ${options.metadata.provider}. Supports pagination to navigate through all videos.`,
          inputSchema: ListVideosInputSchema,
          outputSchema: ListVideosOutputSchema,
          execute: async ({ context }: { context: ListVideosInput }) => {
            const client = options.getClient?.(env) as TClient;
            return options.listTool!.execute({ env, input: context, client });
          },
        })
    : null;

  const extendVideo = options.extendTool
    ? (env: TEnv) =>
        createPrivateTool({
          id: "EXTEND_VIDEO",
          description: `Extend or remix an existing video using ${options.metadata.provider}. Creates a new video based on an existing one with a new prompt.`,
          inputSchema: ExtendVideoInputSchema,
          outputSchema: ExtendVideoOutputSchema,
          execute: async ({ context }: { context: ExtendVideoInput }) => {
            const doExecute = async () => {
              const contractConfig = options.extendTool!.getContract?.(env);

              let transactionId: string | undefined;

              // Only authorize contract if getContract is provided
              if (contractConfig) {
                const authResponse =
                  await contractConfig.binding.CONTRACT_AUTHORIZE({
                    clauses: [
                      {
                        clauseId: contractConfig.clause.clauseId,
                        amount: contractConfig.clause.amount,
                      },
                    ],
                  });
                transactionId = authResponse.transactionId;
              }

              const client = options.getClient?.(env) as TClient;
              const result = await options.extendTool!.execute({
                env,
                input: context,
                client,
              });

              if ("error" in result) {
                return {
                  error: true,
                  finishReason: result.finishReason,
                };
              }

              const storage = options.getStorage(env);
              const saveVideoResult = await saveVideo(storage, {
                videoData: result.data,
                mimeType: result.mimeType || "video/mp4",
                metadata: {
                  prompt: context.prompt,
                  originalVideoId: context.videoId,
                  ...(result.operationName && {
                    operationName: result.operationName,
                  }),
                },
              });

              // Only settle contract if we authorized one
              if (contractConfig && transactionId) {
                await contractConfig.binding.CONTRACT_SETTLE({
                  transactionId,
                  clauses: [
                    {
                      clauseId: contractConfig.clause.clauseId,
                      amount: contractConfig.clause.amount,
                    },
                  ],
                  vendorId: env.DECO_CHAT_WORKSPACE,
                });
              }

              return {
                video: saveVideoResult.url,
                operationName: result.operationName,
              };
            };

            const withMiddlewares = applyMiddlewares({
              fn: doExecute,
              middlewares: [
                withLogging({
                  title: `${options.metadata.provider} - Extend`,
                  startMessage: "Starting video extension...",
                }),
                withRetry(MAX_VIDEO_GEN_RETRIES),
                withTimeout(MAX_VIDEO_GEN_TIMEOUT_MS),
              ],
            });

            return withMiddlewares();
          },
        })
    : null;

  // Build tools object with available tools as properties
  return {
    generateVideo,
    ...(listVideos && { listVideos }),
    ...(extendVideo && { extendVideo }),
  };
}
