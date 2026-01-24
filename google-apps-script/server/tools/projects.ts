/**
 * Google Apps Script Projects Tools
 */
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { AppsScriptClient, getAccessToken } from "../lib/apps-script-client.ts";

// ============================================
// Create Project Tool
// ============================================
export const createCreateProjectTool = (env: Env) =>
  createPrivateTool({
    id: "create_project",
    description:
      "Creates a new, empty Apps Script project with no script files and a base manifest file.",
    inputSchema: z.object({
      title: z.string().describe("The title for the project"),
      parentId: z
        .string()
        .optional()
        .describe(
          "The Drive ID of a parent file that the created script project is bound to (optional)",
        ),
    }),
    outputSchema: z.object({
      scriptId: z.string().optional(),
      title: z.string().optional(),
      parentId: z.string().optional(),
      createTime: z.string().optional(),
      updateTime: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.createProject({
        title: context.title,
        parentId: context.parentId,
      });
      return {
        scriptId: result.scriptId,
        title: result.title,
        parentId: result.parentId,
        createTime: result.createTime,
        updateTime: result.updateTime,
      };
    },
  });

// ============================================
// Get Project Tool
// ============================================
export const createGetProjectTool = (env: Env) =>
  createPrivateTool({
    id: "get_project",
    description:
      "Gets a script project's metadata including title, creator, and timestamps.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
    }),
    outputSchema: z.object({
      scriptId: z.string().optional(),
      title: z.string().optional(),
      parentId: z.string().optional(),
      createTime: z.string().optional(),
      updateTime: z.string().optional(),
      creatorEmail: z.string().optional(),
      lastModifyUserEmail: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.getProject(context.scriptId);
      return {
        scriptId: result.scriptId,
        title: result.title,
        parentId: result.parentId,
        createTime: result.createTime,
        updateTime: result.updateTime,
        creatorEmail: result.creator?.email,
        lastModifyUserEmail: result.lastModifyUser?.email,
      };
    },
  });

// ============================================
// Get Project Content Tool
// ============================================
export const createGetProjectContentTool = (env: Env) =>
  createPrivateTool({
    id: "get_project_content",
    description:
      "Gets the content of the script project, including the code source and metadata for each script file.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
    }),
    outputSchema: z.object({
      scriptId: z.string().optional(),
      files: z.array(
        z.object({
          name: z.string(),
          type: z.string(),
          source: z.string(),
          createTime: z.string().optional(),
          updateTime: z.string().optional(),
        }),
      ),
      fileCount: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.getProjectContent(context.scriptId);
      const files =
        result.files?.map((f) => ({
          name: f.name,
          type: f.type,
          source: f.source,
          createTime: f.createTime,
          updateTime: f.updateTime,
        })) || [];
      return {
        scriptId: result.scriptId,
        files,
        fileCount: files.length,
      };
    },
  });

// ============================================
// Update Project Content Tool
// ============================================
export const createUpdateProjectContentTool = (env: Env) =>
  createPrivateTool({
    id: "update_project_content",
    description:
      "Updates the content of the specified script project. This replaces all script files with the provided files.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      files: z
        .array(
          z.object({
            name: z
              .string()
              .describe("The file name (e.g., 'Code.gs', 'index.html')"),
            type: z
              .enum(["SERVER_JS", "HTML", "JSON"])
              .describe(
                "The file type: SERVER_JS for .gs files, HTML for .html files, JSON for appsscript.json",
              ),
            source: z.string().describe("The file content/source code"),
          }),
        )
        .describe("The list of script project files to upload"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      scriptId: z.string().optional(),
      fileCount: z.number(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.updateProjectContent(context.scriptId, {
        files: context.files,
      });
      return {
        success: true,
        scriptId: result.scriptId,
        fileCount: result.files?.length || 0,
        message: `Project content updated with ${result.files?.length || 0} file(s)`,
      };
    },
  });

// ============================================
// Get Project Metrics Tool
// ============================================
export const createGetProjectMetricsTool = (env: Env) =>
  createPrivateTool({
    id: "get_project_metrics",
    description:
      "Get metrics data for a script project including active users, total executions, and failed executions.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      metricsGranularity: z
        .enum(["UNSPECIFIED_GRANULARITY", "WEEKLY", "DAILY"])
        .optional()
        .describe("The granularity of metrics to return (default: DAILY)"),
      deploymentId: z
        .string()
        .optional()
        .describe("Filter metrics by specific deployment ID (optional)"),
    }),
    outputSchema: z.object({
      activeUsers: z.array(
        z.object({
          value: z.string().optional(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
        }),
      ),
      totalExecutions: z.array(
        z.object({
          value: z.string().optional(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
        }),
      ),
      failedExecutions: z.array(
        z.object({
          value: z.string().optional(),
          startTime: z.string().optional(),
          endTime: z.string().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.getProjectMetrics(
        context.scriptId,
        context.metricsGranularity,
        context.deploymentId
          ? { deploymentId: context.deploymentId }
          : undefined,
      );
      return {
        activeUsers: result.metrics?.activeUsers || [],
        totalExecutions: result.metrics?.totalExecutions || [],
        failedExecutions: result.metrics?.failedExecutions || [],
      };
    },
  });

// Export all project tools
export const projectTools = [
  createCreateProjectTool,
  createGetProjectTool,
  createGetProjectContentTool,
  createUpdateProjectContentTool,
  createGetProjectMetricsTool,
];
