import { z } from "zod";
import type { Env } from "../main.ts";
import { createAssistantClient } from "./utils/pinecone.ts";
import { createFileManagementTools } from "@decocms/mcps-shared/tools/file-management";
import {
  createFileFromInput,
  createFormDataWithFile,
} from "@decocms/mcps-shared/tools";

/**
 * Pinecone Assistant tools using the file management factory
 */
export const pineconeAssistantTools = createFileManagementTools<
  Env,
  ReturnType<typeof createAssistantClient>
>({
  metadata: {
    provider: "Pinecone Assistant",
    description: "Manage files and search context in Pinecone Assistant",
  },
  getClient: (env) => createAssistantClient(env),

  uploadTool: {
    execute: async ({ client, input }) => {
      // Create file from URL or content using shared utility
      const { file } = await createFileFromInput(input);

      // Create FormData using shared utility
      const formData = createFormDataWithFile(file);

      // Upload to Pinecone
      const data = await client.uploadFile(formData, input.metadata);

      return data;
    },
    successMessage:
      "File uploaded successfully. It may take a few minutes to be available.",
    getContract: (env) => ({
      binding: env.PINECONE_CONTRACT,
      clause: {
        clauseId: "pinecone:upsert",
        amount: 1,
      },
    }),
  },

  listTool: {
    execute: async ({ client, input }) => {
      const result = await client.listFiles(input.filter);
      return {
        files: result.files.map((file: any) => ({
          id: file.id,
          name: file.name,
          status: file.status,
          created_on: file.created_on,
          updated_on: file.updated_on,
          metadata: file.metadata,
        })),
        total: result.files.length,
      };
    },
  },

  getTool: {
    execute: async ({ client, input }) => {
      return await client.getFile(input.fileId, input.includeUrl ?? true);
    },
    getContract: (env) => ({
      binding: env.PINECONE_CONTRACT,
      clause: {
        clauseId: "pinecone:fetch",
        amount: 1,
      },
    }),
  },

  deleteTool: {
    execute: async ({ client, input }) => {
      await client.deleteFile(input.fileId);
    },
    successMessage: "File deleted successfully",
    getContract: (env) => ({
      binding: env.PINECONE_CONTRACT,
      clause: {
        clauseId: "pinecone:delete",
        amount: 1,
      },
    }),
  },

  searchTool: {
    inputSchema: z.object({
      query: z.string().describe("Query to search for"),
      filter: z
        .string()
        .optional()
        .describe(
          'Optionally filter which documents can be retrieved using metadata fields. Example: {"type": "faq_entry"}',
        ),
      topK: z
        .number()
        .optional()
        .describe(
          "The number of context snippets to retrieve. Defaults to 15.",
        ),
      includeMetadata: z
        .boolean()
        .optional()
        .describe(
          "Whether to include metadata in the response. Defaults to false.",
        ),
    }),
    outputSchema: z.object({
      content: z.array(
        z.object({
          type: z.string(),
          text: z.string(),
          metadata: z.record(z.string()).optional(),
        }),
      ),
    }),
    description:
      "Retrieves relevant document snippets from the assistant's knowledge base. Returns an array of text snippets from the most relevant documents. Use the 'topK' parameter to control result count (default: 15). Recommended topK: a few (5-8) for simple/narrow queries, 10-20 for complex/broad topics.",
    execute: async ({ client, input }) => {
      try {
        const result = await client.searchContext({
          query: input.query,
          filter: input.filter ? JSON.parse(input.filter) : undefined,
        });

        return {
          content: result.snippets.map((snippet: any) => {
            const text = JSON.stringify({
              file_name: snippet.reference.file.name,
              pages: snippet.reference.pages,
              content: snippet.content,
            });

            return {
              type: "text",
              text,
              metadata:
                input.includeMetadata && snippet.reference.file.metadata
                  ? Object.fromEntries(
                      Object.entries(snippet.reference.file.metadata).map(
                        ([k, v]) => [k, String(v)],
                      ),
                    )
                  : undefined,
            };
          }),
        };
      } catch (error) {
        throw new Error(
          `Failed to search context: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
    getContract: (env) => ({
      binding: env.PINECONE_CONTRACT,
      clause: {
        clauseId: "pinecone:query",
        amount: 1,
      },
    }),
  },
});
