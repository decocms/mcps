/**
 * Presentation Management Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { SlidesClient, getAccessToken } from "../lib/slides-client.ts";

const PresentationSchema = z.object({
  presentationId: z.string(),
  title: z.string(),
  slideCount: z.number(),
});

const SlideSchema = z.object({
  objectId: z.string(),
  pageType: z.string().optional(),
  elementCount: z.number(),
});

export const createCreatePresentationTool = (env: Env) =>
  createPrivateTool({
    id: "create_presentation",
    description: "Create a new Google Slides presentation.",
    inputSchema: z.object({
      title: z.string().describe("Presentation title"),
    }),
    outputSchema: z.object({
      presentation: PresentationSchema,
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      const pres = await client.createPresentation(context.title);
      return {
        presentation: {
          presentationId: pres.presentationId,
          title: pres.title,
          slideCount: pres.slides?.length || 0,
        },
        success: true,
      };
    },
  });

export const createGetPresentationTool = (env: Env) =>
  createPrivateTool({
    id: "get_presentation",
    description: "Get presentation details and slide list.",
    inputSchema: z.object({
      presentationId: z.string().describe("Presentation ID"),
    }),
    outputSchema: z.object({
      presentation: PresentationSchema,
      slides: z.array(SlideSchema),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      const pres = await client.getPresentation(context.presentationId);
      return {
        presentation: {
          presentationId: pres.presentationId,
          title: pres.title,
          slideCount: pres.slides?.length || 0,
        },
        slides: (pres.slides || []).map((slide) => ({
          objectId: slide.objectId,
          pageType: slide.pageType,
          elementCount: slide.pageElements?.length || 0,
        })),
      };
    },
  });

export const createListPresentationsTool = (env: Env) =>
  createPrivateTool({
    id: "list_presentations",
    description:
      "List Google Slides presentations created or opened through this app, most recently modified first. " +
      "Note: presentations the user created elsewhere in Drive are not visible to this integration.",
    inputSchema: z.object({
      nameContains: z
        .string()
        .optional()
        .describe("Filter presentations whose name contains this text"),
      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of presentations to return (default: 25)"),
      pageToken: z
        .string()
        .optional()
        .describe("Token from a previous call to fetch the next page"),
    }),
    outputSchema: z.object({
      presentations: z.array(
        z.object({
          presentationId: z.string(),
          title: z.string(),
          createdTime: z.string().optional(),
          modifiedTime: z.string().optional(),
          webViewLink: z.string().optional(),
        }),
      ),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new SlidesClient({ accessToken: getAccessToken(env) });
      const result = await client.listPresentations({
        nameContains: context.nameContains,
        pageSize: context.pageSize,
        pageToken: context.pageToken,
      });
      return {
        presentations: (result.files ?? []).map((file) => ({
          presentationId: file.id,
          title: file.name,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          webViewLink: file.webViewLink,
        })),
        nextPageToken: result.nextPageToken,
      };
    },
  });

export const presentationTools = [
  createCreatePresentationTool,
  createGetPresentationTool,
  createListPresentationsTool,
];
