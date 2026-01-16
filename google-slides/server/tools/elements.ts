/**
 * Element Insertion Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { SlidesClient, getAccessToken } from "../lib/slides-client.ts";
import { SHAPE_TYPE } from "../constants.ts";

const ShapeEnum = z.enum([
  "RECTANGLE",
  "ROUND_RECTANGLE",
  "ELLIPSE",
  "TRIANGLE",
  "ARROW_NORTH",
  "ARROW_EAST",
  "ARROW_SOUTH",
  "ARROW_WEST",
  "STAR_5",
  "HEART",
  "CLOUD",
  "SPEECH",
]);

export const createInsertTextTool = (env: Env) =>
  createPrivateTool({
    id: "insert_text",
    description:
      "Insert a text box on a slide. Positions are in points (72 points = 1 inch).",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      slideId: z.string().describe("Slide object ID"),
      text: z.string().describe("Text content"),
      x: z.coerce.number().describe("X position in points"),
      y: z.coerce.number().describe("Y position in points"),
      width: z.coerce.number().describe("Width in points"),
      height: z.coerce.number().describe("Height in points"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      await client.insertTextBox(
        context.presentationId,
        context.slideId,
        context.text,
        context.x,
        context.y,
        context.width,
        context.height,
      );
      return { success: true, message: "Text box inserted" };
    },
  });

export const createInsertImageTool = (env: Env) =>
  createPrivateTool({
    id: "insert_image",
    description: "Insert an image on a slide from URL.",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      slideId: z.string().describe("Slide object ID"),
      imageUrl: z
        .string()
        .url()
        .describe("Image URL (must be publicly accessible)"),
      x: z.coerce.number().describe("X position in points"),
      y: z.coerce.number().describe("Y position in points"),
      width: z.coerce.number().describe("Width in points"),
      height: z.coerce.number().describe("Height in points"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      await client.insertImage(
        context.presentationId,
        context.slideId,
        context.imageUrl,
        context.x,
        context.y,
        context.width,
        context.height,
      );
      return { success: true, message: "Image inserted" };
    },
  });

export const createInsertShapeTool = (env: Env) =>
  createPrivateTool({
    id: "insert_shape",
    description: "Insert a shape on a slide.",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      slideId: z.string().describe("Slide object ID"),
      shapeType: ShapeEnum.describe("Shape type"),
      x: z.coerce.number().describe("X position in points"),
      y: z.coerce.number().describe("Y position in points"),
      width: z.coerce.number().describe("Width in points"),
      height: z.coerce.number().describe("Height in points"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      await client.insertShape(
        context.presentationId,
        context.slideId,
        SHAPE_TYPE[context.shapeType as keyof typeof SHAPE_TYPE],
        context.x,
        context.y,
        context.width,
        context.height,
      );
      return { success: true, message: `${context.shapeType} shape inserted` };
    },
  });

export const createInsertTableTool = (env: Env) =>
  createPrivateTool({
    id: "insert_table",
    description: "Insert a table on a slide.",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      slideId: z.string().describe("Slide object ID"),
      rows: z.coerce.number().min(1).describe("Number of rows"),
      columns: z.coerce.number().min(1).describe("Number of columns"),
      x: z.coerce.number().describe("X position in points"),
      y: z.coerce.number().describe("Y position in points"),
      width: z.coerce.number().describe("Width in points"),
      height: z.coerce.number().describe("Height in points"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      await client.insertTable(
        context.presentationId,
        context.slideId,
        context.rows,
        context.columns,
        context.x,
        context.y,
        context.width,
        context.height,
      );
      return {
        success: true,
        message: `Table ${context.rows}x${context.columns} inserted`,
      };
    },
  });

export const createDeleteElementTool = (env: Env) =>
  createPrivateTool({
    id: "delete_element",
    description: "Delete an element from a slide.",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      elementId: z.string().describe("Element object ID"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      await client.deleteElement(context.presentationId, context.elementId);
      return { success: true, message: "Element deleted" };
    },
  });

export const createReplaceTextTool = (env: Env) =>
  createPrivateTool({
    id: "replace_text",
    description: "Find and replace text across all slides.",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      find: z.string().describe("Text to find"),
      replace: z.string().describe("Replacement text"),
      matchCase: z.boolean().optional().describe("Case-sensitive search"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      const result = await client.replaceAllText(
        context.presentationId,
        context.find,
        context.replace,
        context.matchCase,
      );
      const replaced =
        result.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;
      return { success: true, message: `Replaced ${replaced} occurrence(s)` };
    },
  });

export const elementTools = [
  createInsertTextTool,
  createInsertImageTool,
  createInsertShapeTool,
  createInsertTableTool,
  createDeleteElementTool,
  createReplaceTextTool,
];
