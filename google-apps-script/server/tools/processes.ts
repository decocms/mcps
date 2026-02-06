/**
 * Google Apps Script Processes Tools (Monitoring)
 */
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { AppsScriptClient, getAccessToken } from "../lib/apps-script-client.ts";

const ProcessTypeEnum = z.enum([
  "PROCESS_TYPE_UNSPECIFIED",
  "ADD_ON",
  "EXECUTION_API",
  "TIME_DRIVEN",
  "TRIGGER",
  "WEBAPP",
  "EDITOR",
  "SIMPLE_TRIGGER",
  "MENU",
  "BATCH_TASK",
]);

const ProcessStatusEnum = z.enum([
  "PROCESS_STATUS_UNSPECIFIED",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELED",
  "FAILED",
  "TIMED_OUT",
  "UNKNOWN",
  "DELAYED",
]);

// ============================================
// List User Processes Tool
// ============================================
export const createListUserProcessesTool = (env: Env) =>
  createPrivateTool({
    id: "list_user_processes",
    description:
      "Lists information about processes (script executions) made by or on behalf of the authenticated user across all scripts.",
    inputSchema: z.object({
      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum number of processes to return (1-200, default: 50)"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page of results"),
      scriptId: z
        .string()
        .optional()
        .describe("Filter by specific script ID (optional)"),
      deploymentId: z
        .string()
        .optional()
        .describe("Filter by specific deployment ID (optional)"),
      functionName: z
        .string()
        .optional()
        .describe("Filter by function name (optional)"),
      types: z
        .array(ProcessTypeEnum)
        .optional()
        .describe("Filter by process types (optional)"),
      statuses: z
        .array(ProcessStatusEnum)
        .optional()
        .describe("Filter by process statuses (optional)"),
    }),
    outputSchema: z.object({
      processes: z.array(
        z.object({
          projectName: z.string().optional(),
          functionName: z.string().optional(),
          processType: z.string().optional(),
          processStatus: z.string().optional(),
          startTime: z.string().optional(),
          duration: z.string().optional(),
          userAccessLevel: z.string().optional(),
        }),
      ),
      processCount: z.number(),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.listUserProcesses({
        pageSize: context.pageSize,
        pageToken: context.pageToken,
        userProcessFilter: {
          scriptId: context.scriptId,
          deploymentId: context.deploymentId,
          functionName: context.functionName,
          types: context.types,
          statuses: context.statuses,
        },
      });
      const processes =
        result.processes?.map((p) => ({
          projectName: p.projectName,
          functionName: p.functionName,
          processType: p.processType,
          processStatus: p.processStatus,
          startTime: p.startTime,
          duration: p.duration,
          userAccessLevel: p.userAccessLevel,
        })) || [];
      return {
        processes,
        processCount: processes.length,
        nextPageToken: result.nextPageToken,
      };
    },
  });

// ============================================
// List Script Processes Tool
// ============================================
export const createListScriptProcessesTool = (env: Env) =>
  createPrivateTool({
    id: "list_script_processes",
    description:
      "Lists information about processes (script executions) for a specific script project.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum number of processes to return (1-200, default: 50)"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page of results"),
      deploymentId: z
        .string()
        .optional()
        .describe("Filter by specific deployment ID (optional)"),
      functionName: z
        .string()
        .optional()
        .describe("Filter by function name (optional)"),
      types: z
        .array(ProcessTypeEnum)
        .optional()
        .describe("Filter by process types (optional)"),
      statuses: z
        .array(ProcessStatusEnum)
        .optional()
        .describe("Filter by process statuses (optional)"),
    }),
    outputSchema: z.object({
      processes: z.array(
        z.object({
          projectName: z.string().optional(),
          functionName: z.string().optional(),
          processType: z.string().optional(),
          processStatus: z.string().optional(),
          startTime: z.string().optional(),
          duration: z.string().optional(),
          userAccessLevel: z.string().optional(),
        }),
      ),
      processCount: z.number(),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.listScriptProcesses(context.scriptId, {
        pageSize: context.pageSize,
        pageToken: context.pageToken,
        scriptProcessFilter: {
          deploymentId: context.deploymentId,
          functionName: context.functionName,
          types: context.types,
          statuses: context.statuses,
        },
      });
      const processes =
        result.processes?.map((p) => ({
          projectName: p.projectName,
          functionName: p.functionName,
          processType: p.processType,
          processStatus: p.processStatus,
          startTime: p.startTime,
          duration: p.duration,
          userAccessLevel: p.userAccessLevel,
        })) || [];
      return {
        processes,
        processCount: processes.length,
        nextPageToken: result.nextPageToken,
      };
    },
  });

// ============================================
// Get Running Processes Tool
// ============================================
export const createGetRunningProcessesTool = (env: Env) =>
  createPrivateTool({
    id: "get_running_processes",
    description:
      "Gets all currently running processes for the authenticated user. Paginates through all results to ensure no running processes are missed. Useful for monitoring active script executions.",
    inputSchema: z.object({
      scriptId: z
        .string()
        .optional()
        .describe("Filter by specific script ID (optional)"),
    }),
    outputSchema: z.object({
      processes: z.array(
        z.object({
          projectName: z.string().optional(),
          functionName: z.string().optional(),
          processType: z.string().optional(),
          startTime: z.string().optional(),
          duration: z.string().optional(),
        }),
      ),
      runningCount: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });

      // Paginate through all results to ensure we don't miss any running processes
      const allProcesses: Array<{
        projectName?: string;
        functionName?: string;
        processType?: string;
        startTime?: string;
        duration?: string;
      }> = [];
      let pageToken: string | undefined;

      do {
        const result = await client.listUserProcesses({
          pageSize: 100,
          pageToken,
          userProcessFilter: {
            scriptId: context.scriptId,
            statuses: ["RUNNING"],
          },
        });

        if (result.processes) {
          allProcesses.push(
            ...result.processes.map((p) => ({
              projectName: p.projectName,
              functionName: p.functionName,
              processType: p.processType,
              startTime: p.startTime,
              duration: p.duration,
            })),
          );
        }

        pageToken = result.nextPageToken;
      } while (pageToken);

      return {
        processes: allProcesses,
        runningCount: allProcesses.length,
      };
    },
  });

// Export all process tools
export const processTools = [
  createListUserProcessesTool,
  createListScriptProcessesTool,
  createGetRunningProcessesTool,
];
