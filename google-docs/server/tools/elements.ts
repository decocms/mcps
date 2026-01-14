/**
 * Element Insertion Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { DocsClient, getAccessToken } from "../lib/docs-client.ts";

export const createInsertTableTool = (env: Env) =>
  createPrivateTool({
    id: "insert_table",
    description: "Insert a table at a specific position.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      rows: z.coerce.number().min(1).describe("Number of rows"),
      columns: z.coerce.number().min(1).describe("Number of columns"),
      index: z.coerce.number().describe("Position to insert"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      await client.insertTable(
        context.documentId,
        context.rows,
        context.columns,
        context.index,
      );
      return {
        success: true,
        message: `Table ${context.rows}x${context.columns} inserted`,
      };
    },
  });

export const createInsertImageTool = (env: Env) =>
  createPrivateTool({
    id: "insert_image",
    description: "Insert an image from URL at a specific position.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      imageUrl: z
        .string()
        .url()
        .describe("Image URL (must be publicly accessible)"),
      index: z.coerce.number().describe("Position to insert"),
      width: z.coerce.number().optional().describe("Width in points"),
      height: z.coerce.number().optional().describe("Height in points"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      await client.insertImage(
        context.documentId,
        context.imageUrl,
        context.index,
        context.width,
        context.height,
      );
      return { success: true, message: "Image inserted" };
    },
  });

export const createInsertPageBreakTool = (env: Env) =>
  createPrivateTool({
    id: "insert_page_break",
    description: "Insert a page break at a specific position.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      index: z.coerce.number().describe("Position to insert"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      await client.insertPageBreak(context.documentId, context.index);
      return { success: true, message: "Page break inserted" };
    },
  });

export const elementTools = [
  createInsertTableTool,
  createInsertImageTool,
  createInsertPageBreakTool,
];
