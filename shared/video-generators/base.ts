import { z } from "zod";
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

export type VideoGeneratorStorage = Pick<
  ObjectStorage,
  "createPresignedReadUrl" | "createPresignedPutUrl"
>;

export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]);

export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const VideoDurationSchema = z.union([
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);

export type VideoDuration = z.infer<typeof VideoDurationSchema>;

export const GenerateVideoInputSchema = z.object({
  prompt: z
    .string()
    .describe("The text prompt describing the video to generate"),
  baseImageUrl: z
    .string()
    .nullable()
    .optional()
    .describe(
      "URL of an existing image to use as base (image-to-video generation)",
    ),
  referenceImages: z
    .array(
      z.object({
        url: z.string(),
        referenceType: z.enum(["asset", "style"]).optional(),
      }),
    )
    .max(3)
    .optional()
    .describe("Up to 3 reference images to guide generation"),
  firstFrameUrl: z.string().optional().describe("URL of the first frame image"),
  lastFrameUrl: z.string().optional().describe("URL of the last frame image"),
  aspectRatio: AspectRatioSchema.optional().describe(
    "Aspect ratio for the generated video (default: 16:9)",
  ),
  duration: VideoDurationSchema.optional().describe(
    "Video duration in seconds (default: 8)",
  ),
  personGeneration: z
    .enum(["dont_allow", "allow_adult"])
    .optional()
    .describe("Control person generation in video"),
  negativePrompt: z.string().optional().describe("What to avoid in generation"),
});

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

export const GenerateVideoOutputSchema = z.object({
  video: z.string().optional().describe("URL of the generated video"),
  error: z.boolean().optional().describe("Whether the request failed"),
  finishReason: z.string().optional().describe("Native finish reason"),
  operationName: z.string().optional().describe("Operation name for tracking"),
});

export type GenerateVideoInput = z.infer<typeof GenerateVideoInputSchema>;
export type GenerateVideoOutput = z.infer<typeof GenerateVideoOutputSchema>;

export interface VideoGeneratorEnv {
  DECO_REQUEST_CONTEXT: {
    ensureAuthenticated: () => any;
  };
  DECO_CHAT_WORKSPACE: string;
}

export interface CreateVideoGeneratorOptions<TEnv extends VideoGeneratorEnv> {
  metadata: {
    provider: string;
    description?: string;
  };
  execute: ({
    env,
    input,
  }: {
    env: TEnv;
    input: GenerateVideoInput;
  }) => Promise<GenerateVideoCallbackOutput>;
  getStorage: (env: TEnv) => VideoGeneratorStorage;
  getContract: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

const MAX_VIDEO_GEN_RETRIES = 3;
const MAX_VIDEO_GEN_TIMEOUT_MS = 360_000; // 6 minutes for video generation

export function createVideoGeneratorTools<TEnv extends VideoGeneratorEnv>(
  options: CreateVideoGeneratorOptions<TEnv>,
) {
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

  return [generateVideo];
}
