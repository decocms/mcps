import {
  createImageGeneratorTool,
  withRetry,
  withLogging,
  withContractManagement,
  saveImageToFileSystem,
  extractImageData,
  type GenerateImageInput,
  type GenerateImageOutput,
} from "@decocms/mcps-shared/image-generators";
import type { Env } from "server/main";
import { createGeminiClient } from "./utils/gemini";

const generateImage = (env: Env) => {
  // Core generation logic
  const executeGeneration = async (
    input: GenerateImageInput,
    env: Env
  ): Promise<GenerateImageOutput> => {
    // Call Gemini API
    const client = createGeminiClient(env);
    const response = await client.generateImage(
      input.prompt,
      input.baseImageUrl || undefined,
      input.aspectRatio
    );

    const candidate = response.candidates[0];
    const inlineData = candidate?.content.parts[0].inline_data;

    // Check if image was generated
    if (!inlineData?.data) {
      return {
        error: true,
        finishReason: candidate.finishReason || undefined,
      };
    }

    // Extract image data
    const { mimeType, imageData } = extractImageData(inlineData);

    // Save to file system
    const { url } = await saveImageToFileSystem(env, {
      imageData,
      mimeType,
      metadata: { prompt: input.prompt },
    });

    return {
      image: url,
      finishReason: candidate.finishReason,
    };
  };

  // Apply middlewares: contract management -> retry -> logging
  const executeWithMiddlewares = withContractManagement(
    withRetry(
      withLogging(executeGeneration, "Gemini"),
      3
    ),
    "gemini-2.5-flash-image-preview:generateContent"
  );

  // Create the tool
  return createImageGeneratorTool(env, {
    id: "GENERATE_IMAGE",
    provider: "Gemini 2.5 Flash Image Preview",
    description: "Generate an image using the Gemini API",
    execute: executeWithMiddlewares,
  });
};

export const geminiTools = [generateImage];
