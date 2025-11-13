/**
 * Pinecone Assistant tools.
 *
 * This file provides MCP tools for interacting with Pinecone Assistant API:
 * - Upload files to the assistant
 * - Search for relevant context snippets
 * - List all files
 * - Get file details
 * - Delete files
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "../main.ts";
import { createAssistantClient } from "../lib/assistant-client.ts";
import {
  fileUploadInputSchema,
  fileUploadOutputSchema,
  fileDeleteInputSchema,
  fileDeleteOutputSchema,
  fileGetInputSchema,
  fileGetOutputSchema,
  fileListInputSchema,
  fileListOutputSchema,
  createFileFromInput,
  createFormDataWithFile,
  createFileUploadSuccess,
  createFileDeleteSuccess,
  createFileListSuccess,
  validateFileId,
  withFileOperationErrorHandling,
  type FileUploadInput,
  type FileGetInput,
  type FileDeleteInput,
} from "@decocms/mcps-shared/tools/file-management";

/**
 * Tool for uploading files to the assistant
 */
export const createUploadFileTool = (env: Env) =>
  createPrivateTool({
    id: "upload_file",
    description:
      "Uploads a file to the Pinecone assistant. You can provide either a file URL or file content. The file will be processed and made available for context retrieval.",
    inputSchema: fileUploadInputSchema,
    outputSchema: fileUploadOutputSchema,
    execute: async ({ context }: { context: FileUploadInput }) => {
      return await withFileOperationErrorHandling(async () => {
        const client = createAssistantClient(env);

        // Create file from URL or content using shared utility
        const { file } = await createFileFromInput(context);

        // Create FormData using shared utility
        const formData = createFormDataWithFile(file);

        // Upload the file
        const data = await client.uploadFile(formData, context.metadata);

        // Check for API errors
        if (data.error_message) {
          throw new Error(data.error_message);
        }

        // Return standardized success response
        return createFileUploadSuccess(
          {
            id: data.id,
            name: data.name,
            status: data.status,
            created_on: data.created_on,
            metadata: data.metadata,
          },
          "File uploaded successfully. It may take a few minutes to be available.",
        );
      }, "Failed to upload file");
    },
  });

/**
 * Tool for searching relevant context from the assistant's knowledge base
 */
export const createSearchContextTool = (env: Env) =>
  createPrivateTool({
    id: "search_context",
    description:
      "Retrieves relevant document snippets from the assistant's knowledge base. Returns an array of text snippets from the most relevant documents. Use the 'topK' parameter to control result count (default: 15). Recommended topK: a few (5-8) for simple/narrow queries, 10-20 for complex/broad topics.",
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
    execute: async ({
      context,
    }: {
      context: {
        query: string;
        filter?: string;
        topK?: number;
        includeMetadata?: boolean;
      };
    }) => {
      const client = createAssistantClient(env);

      try {
        const result = await client.searchContext({
          query: context.query,
          filter: context.filter ? JSON.parse(context.filter) : undefined,
        });

        return {
          content: result.snippets.map((snippet) => {
            const text = JSON.stringify({
              file_name: snippet.reference.file.name,
              pages: snippet.reference.pages,
              content: snippet.content,
            });

            return {
              type: "text",
              text,
              metadata:
                context.includeMetadata && snippet.reference.file.metadata
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
  });

/**
 * Tool for listing all files in the assistant
 */
export const createListFilesTool = (env: Env) =>
  createPrivateTool({
    id: "list_files",
    description: "Lists all files in the Pinecone assistant",
    inputSchema: fileListInputSchema,
    outputSchema: fileListOutputSchema,
    execute: async ({
      context,
    }: {
      context: { filter?: string; limit?: number; offset?: number };
    }) => {
      try {
        const client = createAssistantClient(env);
        const result = await client.listFiles(context.filter);

        // Return standardized success response
        return createFileListSuccess(
          result.files.map((file) => ({
            id: file.id,
            name: file.name,
            status: file.status,
            created_on: file.created_on,
            updated_on: file.updated_on,
            metadata: file.metadata,
          })),
        );
      } catch (error) {
        return {
          success: false,
          files: [],
          message:
            error instanceof Error ? error.message : "Failed to list files",
        };
      }
    },
  });

/**
 * Tool for getting a specific file by ID
 */
export const createGetFileTool = (env: Env) =>
  createPrivateTool({
    id: "get_file",
    description: "Gets details of a specific file from the Pinecone assistant",
    inputSchema: fileGetInputSchema,
    outputSchema: fileGetOutputSchema,
    execute: async ({ context }: { context: FileGetInput }) => {
      return await withFileOperationErrorHandling(async () => {
        // Validate input using shared utility
        validateFileId(context.fileId);

        const client = createAssistantClient(env);
        const file = await client.getFile(
          context.fileId,
          context.includeUrl ?? true,
        );

        // Return standardized success response
        return {
          success: true,
          file: {
            id: file.id,
            name: file.name,
            status: file.status,
            created_on: file.created_on,
            updated_on: file.updated_on,
            metadata: file.metadata,
            signed_url: file.signed_url,
            percent_done: file.percent_done,
            error_message: file.error_message,
          },
        };
      }, "Failed to get file");
    },
  });

/**
 * Tool for deleting a file from the assistant
 */
export const createDeleteFileTool = (env: Env) =>
  createPrivateTool({
    id: "delete_file",
    description: "Deletes a file from the Pinecone assistant",
    inputSchema: fileDeleteInputSchema,
    outputSchema: fileDeleteOutputSchema,
    execute: async ({ context }: { context: FileDeleteInput }) => {
      return await withFileOperationErrorHandling(async () => {
        // Validate input using shared utility
        validateFileId(context.fileId);

        const client = createAssistantClient(env);
        await client.deleteFile(context.fileId);

        // Return standardized success response
        return createFileDeleteSuccess();
      }, "Failed to delete file");
    },
  });

// Export all assistant tools as factory functions
export const assistantTools = [
  createUploadFileTool,
  createSearchContextTool,
  createListFilesTool,
  createGetFileTool,
  createDeleteFileTool,
];
