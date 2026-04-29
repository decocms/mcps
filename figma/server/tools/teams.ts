import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getAccessToken } from "../lib/env.ts";
import { FigmaClient } from "../lib/figma-client.ts";

export const createGetTeamProjectsTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_team_projects",
    description:
      "List all projects within a Figma team. Returns project IDs and names.",
    inputSchema: z.object({
      team_id: z.string().describe("The ID of the Figma team."),
    }),
    execute: async ({ context }) => {
      const client = new FigmaClient(getAccessToken(env));
      return await client.getTeamProjects(context.team_id);
    },
  });

export const createGetProjectFilesTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_project_files",
    description:
      "List all files in a Figma project. Returns file keys, names, thumbnails, and last modified dates.",
    inputSchema: z.object({
      project_id: z.string().describe("The ID of the Figma project."),
    }),
    execute: async ({ context }) => {
      const client = new FigmaClient(getAccessToken(env));
      return await client.getProjectFiles(context.project_id);
    },
  });

export const createGetTeamComponentsTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_team_components",
    description:
      "Get all published components in a Figma team library. Returns component metadata including names, descriptions, thumbnails, and containing frames. Supports cursor-based pagination.",
    inputSchema: z.object({
      team_id: z.string().describe("The ID of the Figma team."),
      page_size: z
        .number()
        .optional()
        .describe("Number of items per page (max 30)."),
      after: z
        .number()
        .optional()
        .describe("Cursor for forward pagination (from previous response)."),
      before: z
        .number()
        .optional()
        .describe("Cursor for backward pagination (from previous response)."),
    }),
    execute: async ({ context }) => {
      const { team_id, ...params } = context;
      const client = new FigmaClient(getAccessToken(env));
      return await client.getTeamComponents(team_id, params);
    },
  });

export const createGetTeamStylesTool = (env: Env) =>
  createPrivateTool({
    id: "figma_get_team_styles",
    description:
      "Get all published styles in a Figma team library. Returns style metadata including names, descriptions, types (FILL, TEXT, EFFECT, GRID), and thumbnails. Supports cursor-based pagination.",
    inputSchema: z.object({
      team_id: z.string().describe("The ID of the Figma team."),
      page_size: z
        .number()
        .optional()
        .describe("Number of items per page (max 30)."),
      after: z
        .number()
        .optional()
        .describe("Cursor for forward pagination (from previous response)."),
      before: z
        .number()
        .optional()
        .describe("Cursor for backward pagination (from previous response)."),
    }),
    execute: async ({ context }) => {
      const { team_id, ...params } = context;
      const client = new FigmaClient(getAccessToken(env));
      return await client.getTeamStyles(team_id, params);
    },
  });

export const teamTools = [
  createGetTeamProjectsTool,
  createGetProjectFilesTool,
  createGetTeamComponentsTool,
  createGetTeamStylesTool,
];
