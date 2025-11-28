import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/mastra";
import { saveImage } from "./storage";
import { ObjectStorage } from "../storage";
import {
  applyMiddlewares,
  Contract,
  ContractClause,
  withLogging,
  withRetry,
  withTimeout,
} from "./middleware";

export type ImageGeneratorStorage = Pick<
  ObjectStorage,
  "createPresignedReadUrl" | "createPresignedPutUrl"
>;

export const AspectRatioSchema = z.enum([
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
]);

export type AspectRatio = z.infer<typeof AspectRatioSchema>;
export const GenerateImageInputSchema = z.object({
  prompt: z
    .string()
    .describe("The text prompt describing the image to generate"),
  baseImageUrl: z
    .string()
    .nullable()
    .optional()
    .describe(
      "URL of an existing image to use as base (image-to-image generation)",
    ),
  aspectRatio: AspectRatioSchema.optional().describe(
    "Aspect ratio for the generated image (default: 1:1)",
  ),
  model: z.string().describe("Model identifier to use for image generation"),
});

export interface GenerateImageCallbackOutputSuccess {
  /**
   * The raw data of the image
   */
  data: string;
  /**
   * The mime type of the image
   */
  mimeType?: string;
}

export interface GenerateImageCallbackOutputError {
  error: true;
  /**
   * The finish reason of the image generation
   */
  finishReason?: string;
}

type GenerateImageCallbackOutput =
  | GenerateImageCallbackOutputSuccess
  | GenerateImageCallbackOutputError;

export const GenerateImageOutputSchema = z.object({
  image: z.string().optional().describe("URL of the generated image"),
  error: z.boolean().optional().describe("Whether the request failed"),
  finishReason: z.string().optional().describe("Native finish reason"),
});

export type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;
export type GenerateImageOutput = z.infer<typeof GenerateImageOutputSchema>;

export interface ImageGeneratorEnv {
  DECO_REQUEST_CONTEXT: {
    ensureAuthenticated: () => any;
  };
  DECO_CHAT_WORKSPACE: string;
}

export interface CreateImageGeneratorOptions<TEnv extends ImageGeneratorEnv> {
  metadata: {
    provider: string;
    description?: string;
  };
  execute: ({
    env,
    input,
  }: {
    env: TEnv;
    input: GenerateImageInput;
  }) => Promise<GenerateImageCallbackOutput>;
  getStorage: (env: TEnv) => ImageGeneratorStorage;
  getContract: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

const MAX_IMAGE_GEN_RETRIES = 3;
const MAX_IMAGE_GEN_TIMEOUT_MS = 120_000; // 2 minutes

export function createImageGeneratorTools<TEnv extends ImageGeneratorEnv>(
  options: CreateImageGeneratorOptions<TEnv>,
) {
  const generateImage = (env: TEnv) =>
    createPrivateTool({
      id: "GENERATE_IMAGE",
      description:
        options.metadata.description ||
        `Generate images using ${options.metadata.provider}`,
      inputSchema: GenerateImageInputSchema,
      outputSchema: GenerateImageOutputSchema,
      execute: async ({ context }: { context: GenerateImageInput }) => {
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
          const saveImageResult = await saveImage(storage, {
            imageData: result.data,
            mimeType: result.mimeType || "image/png",
            metadata: { prompt: context.prompt },
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
            image: saveImageResult.url,
          };
        };

        const withMiddlewares = applyMiddlewares({
          fn: doExecute,
          middlewares: [
            withLogging({
              title: options.metadata.provider,
              startMessage: "Starting image generation...",
            }),
            withRetry(MAX_IMAGE_GEN_RETRIES),
            withTimeout(MAX_IMAGE_GEN_TIMEOUT_MS),
          ],
        });

        return withMiddlewares();
      },
    });

  return [generateImage];
}
