/**
 * memory.get Tool
 *
 * Retrieve a specific memory by ID.
 */

import { z } from "zod";
import { getMemoryDbClient } from "../lib/db.ts";

export const GetMemoryInputSchema = z.object({
  namespace: z.string().min(1).describe("The namespace to search in"),
  id: z.string().uuid().describe("The UUID of the memory to retrieve"),
});

export const MemorySchema = z.object({
  id: z.string().describe("UUID of the memory"),
  namespace: z.string().describe("Namespace the memory belongs to"),
  created_at: z.string().describe("ISO timestamp of creation"),
  updated_at: z.string().describe("ISO timestamp of last update"),
  source_type: z.string().describe("Type of source"),
  source_id: z.string().nullable().describe("Source identifier"),
  source_url: z.string().nullable().describe("Source URL"),
  title: z.string().nullable().describe("Title of the memory"),
  content: z.string().describe("Content of the memory"),
  tags: z.array(z.string()).describe("Tags assigned to the memory"),
  metadata: z.record(z.unknown()).describe("Metadata stored with the memory"),
});

export const GetMemoryOutputSchema = z.object({
  memory: MemorySchema.nullable().describe(
    "The memory if found, null otherwise",
  ),
});

export type GetMemoryInput = z.infer<typeof GetMemoryInputSchema>;
export type GetMemoryOutput = z.infer<typeof GetMemoryOutputSchema>;

/**
 * Execute the memory.get tool
 */
export async function executeGetMemory(
  input: GetMemoryInput,
): Promise<GetMemoryOutput> {
  const db = getMemoryDbClient();
  const memory = await db.getMemory(input.namespace, input.id);
  return { memory };
}
