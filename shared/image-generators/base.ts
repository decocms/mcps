/**
 * Base types and utilities for creating image generator tools.
 * 
 * This module provides a standardized interface for building MCP tools
 * that generate images using various AI providers (Gemini, DALL-E, Midjourney, etc).
 */
import { z } from "zod";
import { createPrivateTool } from "@deco/workers-runtime/mastra";

/**
 * Supported aspect ratios for image generation.
 */
export const AspectRatioSchema = z.enum([
  "1:1",   // 1024x1024
  "2:3",   // 832x1248
  "3:2",   // 1248x832
  "3:4",   // 864x1184
  "4:3",   // 1184x864
  "4:5",   // 896x1152
  "5:4",   // 1152x896
  "9:16",  // 768x1344
  "16:9",  // 1344x768
  "21:9",  // 1536x672
]);

export type AspectRatio = z.infer<typeof AspectRatioSchema>;

/**
 * Standard input schema for image generation tools.
 * All image generators should accept these parameters.
 */
export const GenerateImageInputSchema = z.object({
  prompt: z.string().describe("The text prompt describing the image to generate"),
  baseImageUrl: z
    .string()
    .nullable()
    .optional()
    .describe(
      "The URL of an existing image to use as a base. Only use this if you want to generate an image based on an existing image (image-to-image generation)."
    ),
  aspectRatio: AspectRatioSchema
    .optional()
    .describe(
      "Aspect ratio for the generated image. Options: 1:1 (1024x1024), 2:3 (832x1248), 3:2 (1248x832), 3:4 (864x1184), 4:3 (1184x864), 4:5 (896x1152), 5:4 (1152x896), 9:16 (768x1344), 16:9 (1344x768), 21:9 (1536x672). Defaults to 1:1 if not specified."
    ),
});

/**
 * Standard output schema for image generation tools.
 * All image generators should return these fields.
 */
export const GenerateImageOutputSchema = z.object({
  image: z.string().optional().describe("The URL of the generated image"),
  error: z.boolean().optional().describe("Whether the request failed"),
  finishReason: z
    .string()
    .optional()
    .describe("The native finish reason of the generated image"),
});

export type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;
export type GenerateImageOutput = z.infer<typeof GenerateImageOutputSchema>;

/**
 * Generic Env type for image generator tools.
 * MCPs using image generators should extend this interface.
 */
export interface ImageGeneratorEnv {
  DECO_CHAT_REQUEST_CONTEXT: {
    ensureAuthenticated: () => any;
  };
  DECO_CHAT_WORKSPACE: string;
}

/**
 * Options for creating an image generator tool.
 */
export interface CreateImageGeneratorOptions<TEnv extends ImageGeneratorEnv> {
  /** Unique identifier for the tool */
  id: string;
  /** Provider name (e.g., "Gemini", "DALL-E", "Midjourney") */
  provider: string;
  /** Optional custom description */
  description?: string;
  /** The actual image generation function */
  execute: (input: GenerateImageInput, env: TEnv) => Promise<GenerateImageOutput>;
}

/**
 * Factory function to create an image generator tool that follows
 * the standard contract.
 * 
 * This ensures all image generators have the same input/output interface
 * while allowing custom implementation logic.
 * 
 * @example
 * ```typescript
 * const generateImage = createImageGeneratorTool({
 *   id: "GENERATE_IMAGE",
 *   provider: "Gemini",
 *   execute: async (input, env) => {
 *     // Call your provider API
 *     return { image: "https://...", finishReason: "COMPLETE" };
 *   }
 * });
 * ```
 */
export function createImageGeneratorTool<TEnv extends ImageGeneratorEnv>(
  env: TEnv,
  options: CreateImageGeneratorOptions<TEnv>
) {
  return createPrivateTool({
    id: options.id,
    description:
      options.description || `Generate images using ${options.provider}`,
    inputSchema: GenerateImageInputSchema,
    outputSchema: GenerateImageOutputSchema,
    execute: async ({ context }: { context: GenerateImageInput }) => {
      return options.execute(context, env);
    },
  });
}

