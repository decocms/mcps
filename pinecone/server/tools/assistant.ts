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

/**
 * Tool for uploading files to the assistant
 */
export const createUploadFileTool = (env: Env) =>
  createPrivateTool({
    id: "upload_file",
    description:
      "Uploads a file to the Pinecone assistant. You can provide either a file URL or file content. The file will be processed and made available for context retrieval.",
    inputSchema: z.object({
      fileUrl: z.string().optional().describe("The URL of the file to upload"),
      fileContent: z
        .string()
        .optional()
        .describe("The content of the file to upload (text only)"),
      fileName: z
        .string()
        .optional()
        .describe(
          "The optional name of the file with extension (if not provided, the file will be named 'file-{timestamp}.txt')",
        ),
      metadata: z
        .record(z.unknown())
        .optional()
        .describe("The optional metadata to attach to the file"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      file: z
        .object({
          id: z.string(),
          name: z.string(),
          status: z.string(),
          created_on: z.string(),
          metadata: z.record(z.unknown()).nullable(),
        })
        .nullable(),
      message: z.string().optional(),
    }),
    execute: async ({ input }) => {
      const client = createAssistantClient(env);

      if (!input.fileUrl && !input.fileContent) {
        return {
          success: false,
          file: null,
          message: "No file URL or content provided",
        };
      }

      let fileBuffer: ArrayBuffer | null = null;
      let contentType: string | null = null;

      if (input.fileUrl) {
        const fileResponse = await fetch(input.fileUrl);
        contentType = fileResponse.headers.get("content-type");
        fileBuffer = await fileResponse.arrayBuffer();
      }

      if (input.fileContent) {
        fileBuffer = new TextEncoder().encode(input.fileContent)
          .buffer as ArrayBuffer;
        contentType = "text/plain";
      }

      if (!fileBuffer) {
        return {
          success: false,
          file: null,
          message:
            "Could not create a file buffer from the provided file URL or content",
        };
      }

      const file = new File(
        [fileBuffer],
        input.fileName || `file-${Date.now()}.txt`,
        { type: contentType || "application/octet-stream" },
      );

      const formData = new FormData();
      formData.append("file", file);

      try {
        const data = await client.uploadFile(formData, input.metadata);

        if (data.error_message) {
          return {
            success: false,
            file: null,
            message: data.error_message,
          };
        }

        return {
          success: true,
          file: {
            id: data.id,
            name: data.name,
            status: data.status,
            created_on: data.created_on,
            metadata: data.metadata,
          },
          message:
            "File uploaded successfully. It may take a few minutes to be available.",
        };
      } catch (error) {
        return {
          success: false,
          file: null,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
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
    execute: async ({ input }) => {
      const client = createAssistantClient(env);

      try {
        const result = await client.searchContext({
          query: input.query,
          filter: input.filter ? JSON.parse(input.filter) : undefined,
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
              metadata: input.includeMetadata
                ? (snippet.reference.file.metadata ?? {})
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
    inputSchema: z.object({
      filter: z.string().optional().describe("Optional filter for files"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      files: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          status: z.string(),
          created_on: z.string(),
          updated_on: z.string(),
          metadata: z.record(z.unknown()).nullable(),
        }),
      ),
    }),
    execute: async ({ input }) => {
      const client = createAssistantClient(env);

      try {
        const result = await client.listFiles(input.filter);

        return {
          success: true,
          files: result.files.map((file) => ({
            id: file.id,
            name: file.name,
            status: file.status,
            created_on: file.created_on,
            updated_on: file.updated_on,
            metadata: file.metadata,
          })),
        };
      } catch (error) {
        throw new Error(
          `Failed to list files: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
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
    inputSchema: z.object({
      fileId: z.string().describe("The ID of the file to retrieve"),
      includeUrl: z
        .boolean()
        .optional()
        .describe("Whether to include a signed URL for downloading the file"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      file: z
        .object({
          id: z.string(),
          name: z.string(),
          status: z.string(),
          created_on: z.string(),
          updated_on: z.string(),
          metadata: z.record(z.unknown()).nullable(),
          signed_url: z.string().nullable(),
          percent_done: z.number().nullable(),
          error_message: z.string().nullable(),
        })
        .nullable(),
      message: z.string().optional(),
    }),
    execute: async ({ input }) => {
      const client = createAssistantClient(env);

      try {
        const file = await client.getFile(
          input.fileId,
          input.includeUrl ?? true,
        );

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
      } catch (error) {
        return {
          success: false,
          file: null,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

/**
 * Tool for deleting a file from the assistant
 */
export const createDeleteFileTool = (env: Env) =>
  createPrivateTool({
    id: "delete_file",
    description: "Deletes a file from the Pinecone assistant",
    inputSchema: z.object({
      fileId: z.string().describe("The ID of the file to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string().optional(),
    }),
    execute: async ({ input }) => {
      const client = createAssistantClient(env);

      try {
        await client.deleteFile(input.fileId);

        return {
          success: true,
          message: "File deleted successfully",
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
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
