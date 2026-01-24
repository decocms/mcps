/**
 * Google Apps Script Execution Tools
 */
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { AppsScriptClient, getAccessToken } from "../lib/apps-script-client.ts";

// ============================================
// Run Script Tool
// ============================================
export const createRunScriptTool = (env: Env) =>
  createPrivateTool({
    id: "run_script",
    description:
      "Runs a function in an Apps Script project. The script must be deployed as an API executable. Returns the function's return value.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      functionName: z
        .string()
        .describe("The name of the function to execute in the given script"),
      parameters: z
        .array(z.any())
        .optional()
        .describe(
          "The parameters to be passed to the function being executed (optional)",
        ),
    }),
    outputSchema: z.object({
      done: z.boolean().optional(),
      result: z.any().optional(),
      error: z
        .object({
          code: z.number().optional(),
          message: z.string().optional(),
        })
        .optional(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.runScript(context.scriptId, {
        function: context.functionName,
        parameters: context.parameters,
        devMode: false,
      });
      return {
        done: result.done,
        result: result.response?.result,
        error: result.error
          ? {
              code: result.error.code,
              message: result.error.message,
            }
          : undefined,
      };
    },
  });

// ============================================
// Run Script in Dev Mode Tool
// ============================================
export const createRunScriptDevModeTool = (env: Env) =>
  createPrivateTool({
    id: "run_script_dev_mode",
    description:
      "Runs a function in an Apps Script project in development mode. Uses the most recently saved code instead of a deployed version. Only works if the user is an owner of the script.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      functionName: z
        .string()
        .describe("The name of the function to execute in the given script"),
      parameters: z
        .array(z.any())
        .optional()
        .describe(
          "The parameters to be passed to the function being executed (optional)",
        ),
    }),
    outputSchema: z.object({
      done: z.boolean().optional(),
      result: z.any().optional(),
      error: z
        .object({
          code: z.number().optional(),
          message: z.string().optional(),
        })
        .optional(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.runScript(context.scriptId, {
        function: context.functionName,
        parameters: context.parameters,
        devMode: true,
      });
      return {
        done: result.done,
        result: result.response?.result,
        error: result.error
          ? {
              code: result.error.code,
              message: result.error.message,
            }
          : undefined,
      };
    },
  });

// Export all script tools
export const scriptTools = [createRunScriptTool, createRunScriptDevModeTool];
