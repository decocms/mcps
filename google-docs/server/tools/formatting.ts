/**
 * Formatting Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { DocsClient, getAccessToken } from "../lib/docs-client.ts";
import { NAMED_STYLE_TYPE, BULLET_GLYPH_PRESET } from "../constants.ts";

export const createFormatTextTool = (env: Env) =>
  createPrivateTool({
    id: "format_text",
    description:
      "Apply text formatting (bold, italic, underline, font size) to a range.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      startIndex: z.coerce.number().describe("Start position"),
      endIndex: z.coerce.number().describe("End position (exclusive)"),
      bold: z.boolean().optional().describe("Make text bold"),
      italic: z.boolean().optional().describe("Make text italic"),
      underline: z.boolean().optional().describe("Underline text"),
      fontSize: z.coerce.number().optional().describe("Font size in points"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      await client.formatText(
        context.documentId,
        context.startIndex,
        context.endIndex,
        {
          bold: context.bold,
          italic: context.italic,
          underline: context.underline,
          fontSize: context.fontSize,
        },
      );
      return { success: true, message: "Formatting applied" };
    },
  });

export const createInsertHeadingTool = (env: Env) =>
  createPrivateTool({
    id: "insert_heading",
    description:
      "Insert a heading at a position. Inserts text and applies heading style.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      text: z.string().describe("Heading text"),
      index: z.coerce.number().describe("Position to insert"),
      level: z.coerce.number().min(1).max(6).describe("Heading level (1-6)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      const headingText = context.text + "\n";
      await client.insertText(context.documentId, headingText, context.index);
      const styleType =
        `HEADING_${context.level}` as keyof typeof NAMED_STYLE_TYPE;
      await client.setParagraphStyle(
        context.documentId,
        context.index,
        context.index + headingText.length,
        NAMED_STYLE_TYPE[styleType] || "HEADING_1",
      );
      return { success: true, message: `Heading ${context.level} inserted` };
    },
  });

export const createInsertListTool = (env: Env) =>
  createPrivateTool({
    id: "insert_list",
    description: "Create a bullet or numbered list from existing paragraphs.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      startIndex: z.coerce.number().describe("Start position"),
      endIndex: z.coerce.number().describe("End position"),
      listType: z.enum(["bullet", "numbered"]).describe("Type of list"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      const preset =
        context.listType === "numbered"
          ? BULLET_GLYPH_PRESET.NUMBERED_DECIMAL_ALPHA_ROMAN
          : BULLET_GLYPH_PRESET.BULLET_DISC_CIRCLE_SQUARE;
      await client.createBulletList(
        context.documentId,
        context.startIndex,
        context.endIndex,
        preset,
      );
      return { success: true, message: `${context.listType} list created` };
    },
  });

export const createRemoveListTool = (env: Env) =>
  createPrivateTool({
    id: "remove_list",
    description: "Remove bullet/numbered list formatting from paragraphs.",
    inputSchema: z.object({
      documentId: z.string().describe("Document ID"),
      startIndex: z.coerce.number().describe("Start position"),
      endIndex: z.coerce.number().describe("End position"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DocsClient({ accessToken: getAccessToken(env) });
      await client.removeBulletList(
        context.documentId,
        context.startIndex,
        context.endIndex,
      );
      return { success: true, message: "List formatting removed" };
    },
  });

export const formattingTools = [
  createFormatTextTool,
  createInsertHeadingTool,
  createInsertListTool,
  createRemoveListTool,
];
