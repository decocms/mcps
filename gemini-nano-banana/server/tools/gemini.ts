import { createImageGeneratorTools } from "@decocms/mcps-shared/image-generators";
import type { Env } from "server/main";
import { createGeminiClient } from "./utils/gemini";
import { adaptFileSystemBindingToObjectStorage } from "@decocms/mcps-shared/storage";

// const executeWithMiddlewares = withContractManagement(executeGeneration, {
//   clauseId: "gemini-2.5-flash-image",
//   contract: "NANOBANANA_CONTRACT",
//   provider: "Gemini",
//   maxRetries: 3,
// });

export const geminiTools = createImageGeneratorTools<Env>({
  provider: "Gemini 2.5 Flash Image Preview",
  description: "Generate an image using the Gemini API",
  getStorage: (env) => adaptFileSystemBindingToObjectStorage(env.FILE_SYSTEM),
  execute: async ({ env, input }) => {
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

    return inlineData;
  },
});
