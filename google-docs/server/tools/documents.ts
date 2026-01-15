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

export const documentTools = [createCreateDocumentTool, createGetDocumentTool];
