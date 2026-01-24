/**
 * Google Apps Script Versions Tools
 */
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { AppsScriptClient, getAccessToken } from "../lib/apps-script-client.ts";

// ============================================
// Create Version Tool
// ============================================
export const createCreateVersionTool = (env: Env) =>
  createPrivateTool({
    id: "create_version",
    description:
      "Creates a new immutable version using the current code. Versions are snapshots of the script that can be deployed.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      description: z
        .string()
        .optional()
        .describe("A description for this version (optional)"),
    }),
    outputSchema: z.object({
      versionNumber: z.number().optional(),
      scriptId: z.string().optional(),
      description: z.string().optional(),
      createTime: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.createVersion(context.scriptId, {
        description: context.description,
      });
      return {
        versionNumber: result.versionNumber,
        scriptId: result.scriptId,
        description: result.description,
        createTime: result.createTime,
      };
    },
  });

// ============================================
// Get Version Tool
// ============================================
export const createGetVersionTool = (env: Env) =>
  createPrivateTool({
    id: "get_version",
    description:
      "Gets a specific version of a script project by version number.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      versionNumber: z.coerce
        .number()
        .int()
        .min(1)
        .describe("The version number to retrieve"),
    }),
    outputSchema: z.object({
      versionNumber: z.number().optional(),
      scriptId: z.string().optional(),
      description: z.string().optional(),
      createTime: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.getVersion(
        context.scriptId,
        context.versionNumber,
      );
      return {
        versionNumber: result.versionNumber,
        scriptId: result.scriptId,
        description: result.description,
        createTime: result.createTime,
      };
    },
  });

// ============================================
// List Versions Tool
// ============================================
export const createListVersionsTool = (env: Env) =>
  createPrivateTool({
    id: "list_versions",
    description:
      "Lists all versions of a script project. Returns version numbers, descriptions, and creation times.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum number of versions to return (1-200, default: 50)"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page of results"),
    }),
    outputSchema: z.object({
      versions: z.array(
        z.object({
          versionNumber: z.number().optional(),
          description: z.string().optional(),
          createTime: z.string().optional(),
        }),
      ),
      versionCount: z.number(),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.listVersions(
        context.scriptId,
        context.pageSize,
        context.pageToken,
      );
      const versions =
        result.versions?.map((v) => ({
          versionNumber: v.versionNumber,
          description: v.description,
          createTime: v.createTime,
        })) || [];
      return {
        versions,
        versionCount: versions.length,
        nextPageToken: result.nextPageToken,
      };
    },
  });

// Export all version tools
export const versionTools = [
  createCreateVersionTool,
  createGetVersionTool,
  createListVersionsTool,
];
