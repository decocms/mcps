/**
 * Tool: Generate Embeddings
 * Submit an embedding request to the OpenRouter embeddings router
 */

import { createTool, ensureAuthenticated } from "@decocms/runtime/tools";
import { getOpenRouterApiKey } from "server/lib/env.ts";
import { z } from "zod";
import type { Env } from "../../main.ts";
import { OpenRouter } from "@openrouter/sdk";

export const createGenerateEmbeddingsTool = (env: Env) =>
  createTool({
    id: "GENERATE_EMBEDDINGS",
    description:
      "Generate vector embeddings for text input using OpenRouter's embeddings API. " +
      "Accepts a single string or an array of strings and returns numerical vector representations. " +
      "Useful for semantic search, clustering, classification, and similarity comparisons. " +
      "You must specify an embeddings model (e.g., 'openai/text-embedding-3-small').",
    inputSchema: z.object({
      input: z
        .union([z.string(), z.array(z.string()).min(1)])
        .describe(
          "Text to embed. A single string or an array of strings (e.g., 'Hello world' or ['Hello', 'World'])",
        ),
      model: z
        .string()
        .describe(
          "Embeddings model ID to use (e.g., 'openai/text-embedding-3-small', 'openai/text-embedding-3-large')",
        ),
      encoding_format: z
        .enum(["float", "base64"])
        .optional()
        .describe(
          "Format for the returned embeddings. 'float' returns arrays of numbers, 'base64' returns base64-encoded strings. Defaults to 'float'.",
        ),
      dimensions: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Number of dimensions for the output embeddings. Only supported by some models (e.g., text-embedding-3-small supports 512, 1536).",
        ),
    }),
    outputSchema: z.object({
      data: z.unknown(),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const { input, model, encoding_format, dimensions } = context;
      const sdk = new OpenRouter({ apiKey: getOpenRouterApiKey(env) });

      const inputCount = Array.isArray(input) ? input.length : 1;
      const inputLength = Array.isArray(input)
        ? input.reduce((sum: number, s: string) => sum + s.length, 0)
        : input.length;
      console.log({
        inputCount,
        inputLength,
        model,
        encoding_format,
        dimensions,
      });
      const result = await sdk.embeddings.generate({
        input: input,
        model: model,
        encodingFormat: encoding_format,
        dimensions: dimensions,
      });

      const resultAny = result as any;
      const embeddingsCount = Array.isArray(resultAny.data)
        ? resultAny.data.length
        : 0;
      console.log({ embeddingsCount, model: resultAny.model });

      return {
        data: result,
      };
    },
  });
