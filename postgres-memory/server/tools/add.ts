/**
 * memory.add Tool
 *
 * Add a new memory to the database with automatic embedding generation.
 */

import { z } from "zod";
import { getMemoryDbClient } from "../lib/db.ts";
import { getEmbeddingsProvider } from "../lib/embeddings.ts";

export const AddMemoryInputSchema = z.object({
  namespace: z
    .string()
    .min(1)
    .describe(
      "The namespace to store the memory in (e.g., 'org:acme', 'user:123', 'project:xyz')",
    ),
  content: z.string().min(1).describe("The content of the memory to store"),
  title: z.string().optional().describe("Optional title for the memory"),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tags for categorization and filtering"),
  source_type: z
    .string()
    .default("agent")
    .describe(
      "Type of source: 'agent' (default), 'manual', 'import', 'derived'",
    ),
  source_id: z
    .string()
    .optional()
    .describe(
      "Optional identifier of the source (e.g., message ID, document ID)",
    ),
  source_url: z
    .string()
    .optional()
    .describe("Optional URL reference for the source"),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Optional metadata as JSON object"),
  dedupe: z
    .boolean()
    .default(true)
    .describe(
      "If true (default), returns existing memory if same content already exists in namespace",
    ),
});

export const AddMemoryOutputSchema = z.object({
  id: z.string().describe("UUID of the created or existing memory"),
  created_at: z.string().describe("ISO timestamp of creation"),
  updated_at: z.string().describe("ISO timestamp of last update"),
  tags: z.array(z.string()).describe("Tags assigned to the memory"),
  metadata: z.record(z.unknown()).describe("Metadata stored with the memory"),
  deduplicated: z
    .boolean()
    .describe("Whether an existing memory was returned due to deduplication"),
});

export type AddMemoryInput = z.infer<typeof AddMemoryInputSchema>;
export type AddMemoryOutput = z.infer<typeof AddMemoryOutputSchema>;

/**
 * Execute the memory.add tool
 */
export async function executeAddMemory(
  input: AddMemoryInput,
): Promise<AddMemoryOutput> {
  const db = getMemoryDbClient();
  const embeddings = getEmbeddingsProvider();

  // Generate embedding for the content
  const [embedding] = await embeddings.embed([input.content]);

  // Store the memory
  const memory = await db.addMemory(
    {
      namespace: input.namespace,
      content: input.content,
      title: input.title,
      tags: input.tags,
      source_type: input.source_type,
      source_id: input.source_id,
      source_url: input.source_url,
      metadata: input.metadata,
      dedupe: input.dedupe,
    },
    embedding,
  );

  // Check if it was deduplicated by comparing timestamps
  const deduplicated = memory.created_at !== memory.updated_at;

  return {
    id: memory.id,
    created_at: memory.created_at,
    updated_at: memory.updated_at,
    tags: memory.tags,
    metadata: memory.metadata,
    deduplicated,
  };
}
