import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "server/types/env.ts";
import { createGeminiClient, models, type Model } from "./utils/gemini.ts";

const AspectRatioSchema = z.enum([
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

const GenerateImageInputSchema = z.object({
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
  model: z
    .enum([
      "gemini-2.0-flash-exp",
      "gemini-2.5-flash-image-preview",
      "gemini-2.5-pro-image-preview",
      "gemini-2.5-pro-exp-03-25",
      "gemini-3-pro-image-preview",
    ])
    .optional()
    .describe(
      "Model to use for image generation (default: gemini-2.5-flash-image-preview)",
    ),
});

const GenerateImageOutputSchema = z.object({
  image: z.string().optional().describe("URL of the generated image"),
  error: z.boolean().optional().describe("Whether the request failed"),
  finishReason: z.string().optional().describe("Native finish reason"),
});

type GenerateImageInput = z.infer<typeof GenerateImageInputSchema>;

/** Response types for file system binding calls */
interface FileSystemReadResponse {
  url: string;
}

interface FileSystemWriteResponse {
  url: string;
}

async function saveImageToStorage(
  env: Env,
  imageData: string,
  mimeType: string,
): Promise<string> {
  const fileSystem = env.MESH_REQUEST_CONTEXT.state.FILE_SYSTEM;

  const extension = mimeType.split("/")[1] || "png";
  const name = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `/images/${name}.${extension}`;

  const [readResult, writeResult] = (await Promise.all([
    fileSystem.FS_READ({ path, expiresIn: 3600 }),
    fileSystem.FS_WRITE({ path, contentType: mimeType, expiresIn: 60 }),
  ])) as [FileSystemReadResponse, FileSystemWriteResponse];

  const base64Data = imageData.includes(",")
    ? imageData.split(",")[1]
    : imageData;
  const imageBuffer = Buffer.from(base64Data, "base64");

  const uploadResponse = await fetch(writeResult.url, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: imageBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Failed to upload image: ${uploadResponse.status} ${uploadResponse.statusText}`,
    );
  }

  return readResult.url;
}

const createGenerateImageTool = (env: Env) =>
  createPrivateTool({
    id: "GENERATE_IMAGE",
    description: "Generate an image using Gemini models via OpenRouter",
    inputSchema: GenerateImageInputSchema,
    outputSchema: GenerateImageOutputSchema,
    execute: async ({ context }: { context: GenerateImageInput }) => {
      console.log("[Gemini] Starting image generation...");

      // Execute generation
      const modelToUse = context.model ?? "gemini-2.5-flash-image-preview";
      const parsedModel: Model = models.parse(modelToUse);

      const client = createGeminiClient(env);
      const response = await client.generateImage(
        context.prompt,
        context.baseImageUrl || undefined,
        context.aspectRatio,
        parsedModel,
      );

      if (
        !response ||
        !response.candidates ||
        response.candidates.length === 0
      ) {
        return {
          error: true,
          finishReason: "No response from Gemini API",
        };
      }

      const candidate = response.candidates[0];
      const inlineData = candidate?.content?.parts?.[0]?.inline_data;

      if (!inlineData?.data) {
        return {
          error: true,
          finishReason: candidate?.finishReason || undefined,
        };
      }

      // Save image to storage
      const imageUrl = await saveImageToStorage(
        env,
        inlineData.data,
        inlineData.mime_type || "image/png",
      );

      console.log("[Gemini] Image generation completed successfully");

      return {
        image: imageUrl,
      };
    },
  });

export const geminiTools = [createGenerateImageTool];
