/**
 * Tool: List Embedding Models
 * Returns all available embeddings models and their properties
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { getOpenRouterApiKey } from "server/lib/env.ts";
import { z } from "zod";
import type { Env } from "../../main.ts";
import { createCollectionBindings } from "@decocms/bindings/collections";
import { OpenRouter } from "@openrouter/sdk";

const EMBEDDING_MODELS_BINDING = createCollectionBindings(
  "EMBEDDING_MODELS",
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    context_length: z.number(),
    pricing: z.object({
      prompt: z.string(),
      completion: z.string(),
    }),
  }),
  { readOnly: true },
);

const LIST_BINDING = EMBEDDING_MODELS_BINDING.find(
  (b) => b.name === "COLLECTION_EMBEDDING_MODELS_LIST",
);

if (!LIST_BINDING?.inputSchema || !LIST_BINDING?.outputSchema) {
  throw new Error(
    "COLLECTION_EMBEDDING_MODELS_LIST binding not found or missing schemas",
  );
}

export const createListEmbeddingModelsTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_EMBEDDING_MODELS_LIST",
    description:
      "List all available embeddings models on OpenRouter with their properties. " +
      "Returns model IDs, names, descriptions, context lengths, pricing, and architecture details. " +
      "Use this to discover which embedding models are available before generating embeddings." +
      "Prefer to use a search",
    inputSchema: LIST_BINDING.inputSchema,
    outputSchema: z.object({
      items: z.unknown(),
    }),
    execute: async () => {
      const sdk = new OpenRouter({ apiKey: getOpenRouterApiKey(env) });
      const models = (await sdk.embeddings.listModels()).data;

      return {
        items: models,
        // totalCount: models.length,
        // hasMore: false,
      };
    },
  });
