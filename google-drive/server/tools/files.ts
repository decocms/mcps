/**
 * File Operations Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { DriveClient, getAccessToken } from "../lib/drive-client.ts";

const FileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  parents: z.array(z.string()).optional(),
  createdTime: z.string().optional(),
  modifiedTime: z.string().optional(),
  size: z.string().optional(),
  webViewLink: z.string().optional(),
  webContentLink: z.string().optional(),
});

export const createListFilesTool = (env: Env) =>
  createPrivateTool({
    id: "list_files",
    description: "List files in Google Drive. Can filter with query syntax.",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe(
          "Search query (e.g., \"name contains 'report'\" or \"mimeType='application/pdf'\")",
        ),
      pageSize: z.coerce
        .number()
        .optional()
        .describe("Max results (default 100)"),
      orderBy: z
        .string()
        .optional()
        .describe("Sort order (e.g., 'modifiedTime desc', 'name')"),
    }),
    outputSchema: z.object({
      files: z.array(FileSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      const result = await client.listFiles({
        q: context.query,
        pageSize: context.pageSize || 100,
        orderBy: context.orderBy,
      });
      return { files: result.files || [], count: (result.files || []).length };
    },
  });

export const createGetFileTool = (env: Env) =>
  createPrivateTool({
    id: "get_file",
    description: "Get metadata about a specific file.",
    inputSchema: z.object({
      fileId: z.string().describe("File ID"),
    }),
    outputSchema: z.object({
      file: FileSchema,
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      const file = await client.getFile(context.fileId);
      return { file };
    },
  });

export const createCreateFileTool = (env: Env) =>
  createPrivateTool({
    id: "create_file",
    description:
      "Create a new file (empty). Use specific MIME types for Google Docs/Sheets/Slides.",
    inputSchema: z.object({
      name: z.string().describe("File name"),
      mimeType: z
        .string()
        .optional()
        .describe(
          "MIME type (e.g., 'application/vnd.google-apps.document' for Google Doc)",
        ),
      parentId: z.string().optional().describe("Parent folder ID"),
      description: z.string().optional().describe("File description"),
    }),
    outputSchema: z.object({
      file: FileSchema,
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      const file = await client.createFile({
        name: context.name,
        mimeType: context.mimeType,
        parents: context.parentId ? [context.parentId] : undefined,
        description: context.description,
      });
      return { file, success: true };
    },
  });

export const createUpdateFileTool = (env: Env) =>
  createPrivateTool({
    id: "update_file",
    description:
      "Update file metadata (name, description, move to folder, star/trash).",
    inputSchema: z.object({
      fileId: z.string().describe("File ID"),
      name: z.string().optional().describe("New name"),
      description: z.string().optional().describe("New description"),
      starred: z.boolean().optional().describe("Star/unstar the file"),
      trashed: z.boolean().optional().describe("Move to/from trash"),
      addParents: z
        .array(z.string())
        .optional()
        .describe("Folder IDs to add as parents"),
      removeParents: z
        .array(z.string())
        .optional()
        .describe("Folder IDs to remove as parents"),
    }),
    outputSchema: z.object({
      file: FileSchema,
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      const file = await client.updateFile(
        context.fileId,
        {
          name: context.name,
          description: context.description,
          starred: context.starred,
          trashed: context.trashed,
        },
        context.addParents,
        context.removeParents,
      );
      return { file, success: true };
    },
  });

export const createDeleteFileTool = (env: Env) =>
  createPrivateTool({
    id: "delete_file",
    description: "Permanently delete a file. WARNING: This cannot be undone.",
    inputSchema: z.object({
      fileId: z.string().describe("File ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      await client.deleteFile(context.fileId);
      return { success: true, message: "File deleted permanently" };
    },
  });

export const createCopyFileTool = (env: Env) =>
  createPrivateTool({
    id: "copy_file",
    description: "Create a copy of a file.",
    inputSchema: z.object({
      fileId: z.string().describe("File ID to copy"),
      name: z.string().optional().describe("Name for the copy"),
      parentId: z.string().optional().describe("Destination folder ID"),
    }),
    outputSchema: z.object({
      file: FileSchema,
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      const file = await client.copyFile(
        context.fileId,
        context.name,
        context.parentId ? [context.parentId] : undefined,
      );
      return { file, success: true };
    },
  });

export const createSearchFilesTool = (env: Env) =>
  createPrivateTool({
    id: "search_files",
    description:
      "Search files using Drive query syntax. Supports name, type, content, owner filters.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Search query (e.g., \"fullText contains 'budget'\" or \"'folderId' in parents\")",
        ),
      maxResults: z.coerce
        .number()
        .optional()
        .describe("Max results (default 100)"),
    }),
    outputSchema: z.object({
      files: z.array(FileSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      const files = await client.searchFiles(
        context.query,
        context.maxResults || 100,
      );
      return { files, count: files.length };
    },
  });

export const fileTools = [
  createListFilesTool,
  createGetFileTool,
  createCreateFileTool,
  createUpdateFileTool,
  createDeleteFileTool,
  createCopyFileTool,
  createSearchFilesTool,
];
