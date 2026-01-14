/**
 * Content Operations Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { DocsClient, getAccessToken } from "../lib/docs-client.ts";

export const createInsertTextTool = (env: Env) =>
  createPrivateTool({
    id: "insert_text",
    description:
      "Insert text at a specific position in the document. Index 1 is the beginning.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      text: z.string().describe("Text to insert"),
      index: z.coerce.number().describe("Position to insert (1 = beginning)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      await client.insertText(context.documentId, context.text, context.index);
      return {
        success: true,
        message: `Inserted ${context.text.length} characters`,
      };
    },
  });

export const createDeleteContentTool = (env: Env) =>
  createPrivateTool({
    id: "delete_content",
    description: "Delete content from a range in the document.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      startIndex: z.coerce.number().describe("Start position"),
      endIndex: z.coerce.number().describe("End position (exclusive)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      await client.deleteContent(
        context.documentId,
        context.startIndex,
        context.endIndex,
      );
      return {
        success: true,
        message: `Deleted content from ${context.startIndex} to ${context.endIndex}`,
      };
    },
  });

export const createReplaceTextTool = (env: Env) =>
  createPrivateTool({
    id: "replace_text",
    description: "Find and replace all occurrences of text in the document.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      find: z.string().describe("Text to find"),
      replace: z.string().describe("Replacement text"),
      matchCase: z
        .boolean()
        .optional()
        .describe("Case-sensitive search (default false)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      const result = await client.replaceAllText(
        context.documentId,
        context.find,
        context.replace,
        context.matchCase,
      );
      const replaced =
        result.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;
      return { success: true, message: `Replaced ${replaced} occurrence(s)` };
    },
  });

export const createAppendTextTool = (env: Env) =>
  createPrivateTool({
    id: "append_text",
    description: "Append text to the end of the document.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      text: z.string().describe("Text to append"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      const doc = await client.getDocument(context.documentId);
      const endIndex = client.getEndIndex(doc) - 1;
      await client.insertText(context.documentId, context.text, endIndex);
      return {
        success: true,
        message: `Appended ${context.text.length} characters`,
      };
    },
  });

export const contentTools = [
  createInsertTextTool,
  createDeleteContentTool,
  createReplaceTextTool,
  createAppendTextTool,
];
