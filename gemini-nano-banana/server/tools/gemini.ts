import {
  createImageGeneratorTool,
  withContractManagement,
  extractImageData,
  type GenerateImageInput,
  type GenerateImageOutput,
  createStorageFromEnv,
  saveImage,
} from "@decocms/mcps-shared/image-generators";
import type { Env } from "server/main";
import { createGeminiClient } from "./utils/gemini";

const generateImage = (env: Env) => {
  // Core generation logic
  const executeGeneration = async (
    input: GenerateImageInput,
    env: Env,
  ): Promise<GenerateImageOutput> => {
    // Call Gemini API
    const client = createGeminiClient(env);
    const response = await client.generateImage(
      input.prompt,
      input.baseImageUrl || undefined,
      input.aspectRatio,
    );

    if (!response || !response.candidates || response.candidates.length === 0) {
      return {
        error: true,
        finishReason: "No response from Gemini API",
      };
    }

    const candidate = response.candidates[0];
    const inlineData = candidate?.content?.parts?.[0]?.inline_data;

    // Check if image was generated
    if (!inlineData?.data) {
      return {
        error: true,
        finishReason: candidate?.finishReason || undefined,
      };
    }

    // Extract image data
    const { mimeType, imageData } = extractImageData(inlineData);

    const storage = createStorageFromEnv(env);
    
    // Save to storage
    const saveImageResult = await saveImage(storage, {
      imageData,
      mimeType,
      metadata: { prompt: input.prompt },
    });

    return {
      image: saveImageResult.url,
      finishReason: candidate.finishReason,
    };
  };

  const executeWithMiddlewares = withContractManagement(executeGeneration, {
    clauseId: "gemini-2.5-flash-image",
    contract: "NANOBANANA_CONTRACT",
    provider: "Gemini",
    maxRetries: 3,
  });

  // Create the tool
  return createImageGeneratorTool(env, {
    provider: "Gemini 2.5 Flash Image Preview",
    description: "Generate an image using the Gemini API",
    execute: executeWithMiddlewares,
  });
};

export const geminiTools = [generateImage];
