/**
 * Slide Management Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { SlidesClient, getAccessToken } from "../lib/slides-client.ts";
import { PREDEFINED_LAYOUT } from "../constants.ts";

const LayoutEnum = z.enum([
  "BLANK",
  "CAPTION_ONLY",
  "TITLE",
  "TITLE_AND_BODY",
  "TITLE_AND_TWO_COLUMNS",
  "TITLE_ONLY",
  "SECTION_HEADER",
  "SECTION_TITLE_AND_DESCRIPTION",
  "ONE_COLUMN_TEXT",
  "MAIN_POINT",
  "BIG_NUMBER",
]);

export const createAddSlideTool = (env: Env) =>
  createPrivateTool({
    id: "add_slide",
    description: "Add a new slide to the presentation.",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      layout: LayoutEnum.optional().describe("Slide layout (default: BLANK)"),
      index: z.coerce
        .number()
        .optional()
        .describe("Position to insert (0 = first)"),
    }),
    outputSchema: z.object({
      slideId: z.string().optional(),
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      const result = await client.addSlide(
        context.presentationId,
        (context.layout as keyof typeof PREDEFINED_LAYOUT) || "BLANK",
        context.index,
      );
      const slideId = result.replies?.[0]?.createSlide?.objectId;
      return { slideId, success: true, message: "Slide added" };
    },
  });

export const createDeleteSlideTool = (env: Env) =>
  createPrivateTool({
    id: "delete_slide",
    description: "Delete a slide from the presentation.",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      slideId: z.string().describe("Slide object ID"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      await client.deleteSlide(context.presentationId, context.slideId);
      return { success: true, message: "Slide deleted" };
    },
  });

export const createDuplicateSlideTool = (env: Env) =>
  createPrivateTool({
    id: "duplicate_slide",
    description: "Create a copy of an existing slide.",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      slideId: z.string().describe("Slide to duplicate"),
    }),
    outputSchema: z.object({
      newSlideId: z.string().optional(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      const result = await client.duplicateSlide(
        context.presentationId,
        context.slideId,
      );
      const newSlideId = result.replies?.[0]?.duplicateObject?.objectId;
      return { newSlideId, success: true };
    },
  });

export const createMoveSlideTool = (env: Env) =>
  createPrivateTool({
    id: "move_slide",
    description: "Move a slide to a different position.",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
      slideId: z.string().describe("Slide to move"),
      newIndex: z.coerce.number().describe("New position (0 = first)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      await client.moveSlide(
        context.presentationId,
        context.slideId,
        context.newIndex,
      );
      return {
        success: true,
        message: `Slide moved to position ${context.newIndex}`,
      };
    },
  });

export const slideTools = [
  createAddSlideTool,
  createDeleteSlideTool,
  createDuplicateSlideTool,
  createMoveSlideTool,
];
