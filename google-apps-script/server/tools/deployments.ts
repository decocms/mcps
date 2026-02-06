/**
 * Google Apps Script Deployments Tools
 */
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../shared/deco.gen.ts";
import { AppsScriptClient, getAccessToken } from "../lib/apps-script-client.ts";

// ============================================
// Create Deployment Tool
// ============================================
export const createCreateDeploymentTool = (env: Env) =>
  createPrivateTool({
    id: "create_deployment",
    description:
      "Creates a deployment of an Apps Script project. A deployment makes a specific version accessible as a web app, API executable, or add-on.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      versionNumber: z.coerce
        .number()
        .int()
        .min(1)
        .describe("The version number on which this deployment is based"),
      description: z
        .string()
        .optional()
        .describe("A description for this deployment (optional)"),
      manifestFileName: z
        .string()
        .optional()
        .describe(
          "The manifest file name for this deployment (default: appsscript)",
        ),
    }),
    outputSchema: z.object({
      deploymentId: z.string().optional(),
      versionNumber: z.number().optional(),
      description: z.string().optional(),
      updateTime: z.string().optional(),
      entryPoints: z.array(
        z.object({
          entryPointType: z.string().optional(),
          webAppUrl: z.string().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.createDeployment(context.scriptId, {
        versionNumber: context.versionNumber,
        description: context.description,
        manifestFileName: context.manifestFileName,
      });
      return {
        deploymentId: result.deploymentId,
        versionNumber: result.deploymentConfig?.versionNumber,
        description: result.deploymentConfig?.description,
        updateTime: result.updateTime,
        entryPoints:
          result.entryPoints?.map((ep) => ({
            entryPointType: ep.entryPointType,
            webAppUrl: ep.webApp?.url,
          })) || [],
      };
    },
  });

// ============================================
// Get Deployment Tool
// ============================================
export const createGetDeploymentTool = (env: Env) =>
  createPrivateTool({
    id: "get_deployment",
    description:
      "Gets a specific deployment of an Apps Script project by deployment ID.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      deploymentId: z.string().describe("The deployment ID to retrieve"),
    }),
    outputSchema: z.object({
      deploymentId: z.string().optional(),
      versionNumber: z.number().optional(),
      description: z.string().optional(),
      updateTime: z.string().optional(),
      entryPoints: z.array(
        z.object({
          entryPointType: z.string().optional(),
          webAppUrl: z.string().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.getDeployment(
        context.scriptId,
        context.deploymentId,
      );
      return {
        deploymentId: result.deploymentId,
        versionNumber: result.deploymentConfig?.versionNumber,
        description: result.deploymentConfig?.description,
        updateTime: result.updateTime,
        entryPoints:
          result.entryPoints?.map((ep) => ({
            entryPointType: ep.entryPointType,
            webAppUrl: ep.webApp?.url,
          })) || [],
      };
    },
  });

// ============================================
// List Deployments Tool
// ============================================
export const createListDeploymentsTool = (env: Env) =>
  createPrivateTool({
    id: "list_deployments",
    description:
      "Lists all deployments of an Apps Script project. Returns deployment IDs, versions, and entry point URLs.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe(
          "Maximum number of deployments to return (1-200, default: 50)",
        ),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page of results"),
    }),
    outputSchema: z.object({
      deployments: z.array(
        z.object({
          deploymentId: z.string().optional(),
          versionNumber: z.number().optional(),
          description: z.string().optional(),
          updateTime: z.string().optional(),
          webAppUrl: z.string().optional(),
        }),
      ),
      deploymentCount: z.number(),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.listDeployments(
        context.scriptId,
        context.pageSize,
        context.pageToken,
      );
      const deployments =
        result.deployments?.map((d) => ({
          deploymentId: d.deploymentId,
          versionNumber: d.deploymentConfig?.versionNumber,
          description: d.deploymentConfig?.description,
          updateTime: d.updateTime,
          webAppUrl: d.entryPoints?.find((ep) => ep.webApp)?.webApp?.url,
        })) || [];
      return {
        deployments,
        deploymentCount: deployments.length,
        nextPageToken: result.nextPageToken,
      };
    },
  });

// ============================================
// Update Deployment Tool
// ============================================
export const createUpdateDeploymentTool = (env: Env) =>
  createPrivateTool({
    id: "update_deployment",
    description:
      "Updates a deployment of an Apps Script project. Can change the version number, description, or manifest file.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      deploymentId: z.string().describe("The deployment ID to update"),
      versionNumber: z.coerce
        .number()
        .int()
        .min(1)
        .optional()
        .describe("The new version number for this deployment (optional)"),
      description: z
        .string()
        .optional()
        .describe("The new description for this deployment (optional)"),
      manifestFileName: z
        .string()
        .optional()
        .describe("The new manifest file name for this deployment (optional)"),
    }),
    outputSchema: z.object({
      deploymentId: z.string().optional(),
      versionNumber: z.number().optional(),
      description: z.string().optional(),
      updateTime: z.string().optional(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      const result = await client.updateDeployment(
        context.scriptId,
        context.deploymentId,
        {
          deploymentConfig: {
            scriptId: context.scriptId,
            versionNumber: context.versionNumber,
            description: context.description,
            manifestFileName: context.manifestFileName,
          },
        },
      );
      return {
        deploymentId: result.deploymentId,
        versionNumber: result.deploymentConfig?.versionNumber,
        description: result.deploymentConfig?.description,
        updateTime: result.updateTime,
        message: "Deployment updated successfully",
      };
    },
  });

// ============================================
// Delete Deployment Tool
// ============================================
export const createDeleteDeploymentTool = (env: Env) =>
  createPrivateTool({
    id: "delete_deployment",
    description: "Deletes a deployment of an Apps Script project.",
    inputSchema: z.object({
      scriptId: z.string().describe("The script project's Drive ID"),
      deploymentId: z.string().describe("The deployment ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new AppsScriptClient({
        accessToken: getAccessToken(env),
      });
      await client.deleteDeployment(context.scriptId, context.deploymentId);
      return {
        success: true,
        message: `Deployment ${context.deploymentId} deleted successfully`,
      };
    },
  });

// Export all deployment tools
export const deploymentTools = [
  createCreateDeploymentTool,
  createGetDeploymentTool,
  createListDeploymentsTool,
  createUpdateDeploymentTool,
  createDeleteDeploymentTool,
];
