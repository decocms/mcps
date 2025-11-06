import { z } from "zod";
import { createPrivateTool } from "@deco/workers-runtime/mastra";

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
});

export const GenerateImageOutputSchema = z.object({
  image: z.string().optional().describe("URL of the generated image"),
  error: z.boolean().optional().describe("Whether the request failed"),
  finishReason: z.string().optional().describe("Native finish reason"),
});

export type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;
export type GenerateImageOutput = z.infer<typeof GenerateImageOutputSchema>;

export interface ImageGeneratorEnv {
  DECO_CHAT_REQUEST_CONTEXT: {
    ensureAuthenticated: () => any;
  };
  DECO_CHAT_WORKSPACE: string;
}

export interface CreateImageGeneratorOptions<TEnv extends ImageGeneratorEnv> {
  provider: string;
  description?: string;
  execute: (
    input: GenerateImageInput,
    env: TEnv,
  ) => Promise<GenerateImageOutput>;
}
export function createImageGeneratorTool<TEnv extends ImageGeneratorEnv>(
  env: TEnv,
  options: CreateImageGeneratorOptions<TEnv>,
) {
  return createPrivateTool({
    id: "GENERATE_IMAGE",
    description:
      options.description || `Generate images using ${options.provider}`,
    inputSchema: GenerateImageInputSchema,
    outputSchema: GenerateImageOutputSchema,
    execute: async ({ context }: { context: GenerateImageInput }) => {
      return options.execute(context, env);
    },
  });
}
