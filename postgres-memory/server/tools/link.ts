/**
 * memory.link Tool
 *
 * Create a relationship edge between two memories.
 */

import { z } from "zod";
import { getMemoryDbClient } from "../lib/db.ts";

export const LinkMemoryInputSchema = z.object({
  namespace: z
    .string()
    .min(1)
    .describe("The namespace for the edge (should match memory namespace)"),
  from_id: z.string().uuid().describe("UUID of the source memory"),
  to_id: z.string().uuid().describe("UUID of the target memory"),
  rel_type: z
    .enum(["updates", "extends", "derives", "mentions"])
    .describe(
      "Type of relationship: 'updates' (newer version), 'extends' (adds to), 'derives' (based on), 'mentions' (references)",
    ),
  weight: z
    .number()
    .min(0)
    .max(1)
    .default(1.0)
    .describe("Edge weight for graph traversal (0-1, default: 1.0)"),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Optional metadata for the edge"),
});

export const LinkMemoryOutputSchema = z.object({
  edge_id: z.string().describe("UUID of the created edge"),
  created_at: z.string().describe("ISO timestamp of creation"),
});

export type LinkMemoryInput = z.infer<typeof LinkMemoryInputSchema>;
export type LinkMemoryOutput = z.infer<typeof LinkMemoryOutputSchema>;

/**
 * Execute the memory.link tool
 */
export async function executeLinkMemory(
  input: LinkMemoryInput,
): Promise<LinkMemoryOutput> {
  const db = getMemoryDbClient();

  const edge = await db.linkMemories({
    namespace: input.namespace,
    from_id: input.from_id,
    to_id: input.to_id,
    rel_type: input.rel_type,
    weight: input.weight,
    metadata: input.metadata,
  });

  return {
    edge_id: edge.id,
    created_at: edge.created_at.toISOString(),
  };
}
