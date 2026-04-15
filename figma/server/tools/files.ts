import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getAccessToken } from "../lib/env.ts";
import { FigmaClient } from "../lib/figma-client.ts";

export const createGetFileTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_file",
    description:
      "Get a Figma file's full JSON representation including the document tree, components, and styles. Use the 'depth' parameter to limit response size for large files.",
    inputSchema: z.object({
      file_key: z
        .string()
        .describe("The key of the Figma file (from the file URL)."),
      version: z
        .string()
        .optional()
        .describe("Specific version ID to retrieve."),
      ids: z
        .array(z.string())
        .optional()
        .describe(
          "List of node IDs to retrieve. If specified, only those nodes and their children are returned.",
        ),
      depth: z
        .number()
        .optional()
        .describe(
          "Positive integer specifying how deep into the document tree to traverse. Recommended to limit for large files.",
        ),
      geometry: z
        .string()
        .optional()
        .describe("Set to 'paths' to include vector path data."),
      plugin_data: z
        .string()
        .optional()
        .describe(
          "Comma-separated list of plugin IDs or 'shared' to include plugin data.",
        ),
    }),
    execute: async ({ context }) => {
      const { file_key, ...params } = context;
      const client = new FigmaClient(getAccessToken(env));
      return await client.getFile(file_key, params);
    },
  });

export const createGetFileNodesTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_file_nodes",
    description:
      "Get specific nodes from a Figma file by their IDs. Returns only the requested nodes and their children.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
      ids: z
        .array(z.string())
        .describe("List of node IDs to retrieve (e.g., ['1:2', '3:4'])."),
      version: z
        .string()
        .optional()
        .describe("Specific version ID to retrieve."),
      depth: z
        .number()
        .optional()
        .describe("How deep into the node tree to traverse."),
      geometry: z
        .string()
        .optional()
        .describe("Set to 'paths' to include vector path data."),
      plugin_data: z
        .string()
        .optional()
        .describe(
          "Comma-separated list of plugin IDs or 'shared' to include plugin data.",
        ),
    }),
    execute: async ({ context }) => {
      const { file_key, ids, ...params } = context;
      const client = new FigmaClient(getAccessToken(env));
      return await client.getFileNodes(file_key, ids, params);
    },
  });

export const createGetImagesTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_images",
    description:
      "Render specific nodes from a Figma file as images. Returns URLs to the rendered images in the requested format.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
      ids: z
        .array(z.string())
        .describe("List of node IDs to render as images."),
      scale: z
        .number()
        .min(0.01)
        .max(4)
        .optional()
        .describe("Image scale factor (0.01 to 4). Default is 1."),
      format: z
        .enum(["jpg", "png", "svg", "pdf"])
        .optional()
        .describe("Image output format. Default is 'png'."),
      svg_include_id: z
        .boolean()
        .optional()
        .describe("Whether to include node IDs in SVG output."),
      svg_simplify_stroke: z
        .boolean()
        .optional()
        .describe("Whether to simplify strokes in SVG output."),
      use_absolute_bounds: z
        .boolean()
        .optional()
        .describe(
          "Use absolute bounds for rendering (includes effects outside the node).",
        ),
    }),
    execute: async ({ context }) => {
      const { file_key, ids, ...params } = context;
      const client = new FigmaClient(getAccessToken(env));
      return await client.getImages(file_key, ids, params);
    },
  });

export const createGetImageFillsTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_image_fills",
    description:
      "Get download URLs for all images used as fills in a Figma file.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
    }),
    execute: async ({ context }) => {
      const client = new FigmaClient(getAccessToken(env));
      return await client.getImageFills(context.file_key);
    },
  });

export const createGetFileMetadataTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_file_metadata",
    description:
      "Get metadata for a Figma file including name, last modified date, version, thumbnail URL, and creator info. Lighter than get_file as it does not return the document tree.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
    }),
    execute: async ({ context }) => {
      const client = new FigmaClient(getAccessToken(env));
      return await client.getFileMetadata(context.file_key);
    },
  });

export const createGetFileVersionsTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_file_versions",
    description:
      "Get the version history of a Figma file. Returns a list of versions with IDs, timestamps, labels, descriptions, and the user who created each version.",
    inputSchema: z.object({
      file_key: z.string().describe("The key of the Figma file."),
    }),
    execute: async ({ context }) => {
      const client = new FigmaClient(getAccessToken(env));
      return await client.getFileVersions(context.file_key);
    },
  });

export const fileTools = [
  createGetFileTool,
  createGetFileNodesTool,
  createGetImagesTool,
  createGetImageFillsTool,
  createGetFileMetadataTool,
  createGetFileVersionsTool,
];
