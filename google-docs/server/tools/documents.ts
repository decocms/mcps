/**
 * Document Management Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { DocsClient, getAccessToken } from "../lib/docs-client.ts";

export const createCreateDocumentTool = (env: Env) =>
  createPrivateTool({
    id: "create_document",
    description: "Create a new empty Google Document.",
    inputSchema: z.object({
      title: z.string().describe("Document title"),
    }),
    outputSchema: z.object({
      documentId: z.string(),
      title: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      const doc = await client.createDocument(context.title);
      return { documentId: doc.documentId, title: doc.title, success: true };
    },
  });

export const createGetDocumentTool = (env: Env) =>
  createPrivateTool({
    id: "get_document",
    description: "Get document metadata and content.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
    }),
    outputSchema: z.object({
      documentId: z.string(),
      title: z.string(),
      content: z.string(),
      endIndex: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      const doc = await client.getDocument(context.documentId);
      return {
        documentId: doc.documentId,
        title: doc.title,
        content: client.extractText(doc),
        endIndex: client.getEndIndex(doc),
      };
    },
  });

export const createListDocumentsTool = (env: Env) =>
  createPrivateTool({
    id: "list_documents",
    description:
      "List Google Documents created or opened through this app, most recently modified first. " +
      "Note: documents the user created elsewhere in Drive are not visible to this integration.",
    inputSchema: z.object({
      nameContains: z
        .string()
        .optional()
        .describe("Filter documents whose name contains this text"),
      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of documents to return (default: 25)"),
      pageToken: z
        .string()
        .optional()
        .describe("Token from a previous call to fetch the next page"),
    }),
    outputSchema: z.object({
      documents: z.array(
        z.object({
          documentId: z.string(),
          title: z.string(),
          createdTime: z.string().optional(),
          modifiedTime: z.string().optional(),
          webViewLink: z.string().optional(),
        }),
      ),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      const result = await client.listDocuments({
        nameContains: context.nameContains,
        pageSize: context.pageSize,
        pageToken: context.pageToken,
      });
      return {
        documents: (result.files ?? []).map((file) => ({
          documentId: file.id,
          title: file.name,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          webViewLink: file.webViewLink,
        })),
        nextPageToken: result.nextPageToken,
      };
    },
  });

export const documentTools = [
  createCreateDocumentTool,
  createGetDocumentTool,
  createListDocumentsTool,
];
