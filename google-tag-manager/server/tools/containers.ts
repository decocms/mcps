/**
 * Container Management Tools
 *
 * Tools for managing GTM containers
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GTMClient, getAccessToken } from "../lib/gtm-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const ContainerUsageContextSchema = z.enum([
  "web",
  "android",
  "ios",
  "amp",
  "server",
]);

const ContainerSchema = z.object({
  path: z.string().describe("Container path"),
  accountId: z.string().describe("Account ID"),
  containerId: z.string().describe("Container ID"),
  name: z.string().describe("Container name"),
  publicId: z.string().optional().describe("Public container ID (GTM-XXXXX)"),
  usageContext: z
    .array(ContainerUsageContextSchema)
    .describe("Usage contexts (web, mobile, etc)"),
  fingerprint: z.string().describe("Fingerprint for optimistic locking"),
  tagManagerUrl: z.string().describe("Tag Manager URL for this container"),
  domainName: z
    .array(z.string())
    .optional()
    .describe("Associated domain names"),
  notes: z.string().optional().describe("Container notes"),
  taggingServerUrls: z
    .array(z.string())
    .optional()
    .describe("Server-side tagging URLs"),
});

// ============================================================================
// List Containers Tool
// ============================================================================

export const createListContainersTool = (env: Env) =>
  createPrivateTool({
    id: "list_containers",
    description:
      "List all containers in a GTM account. Returns container IDs, names, and usage contexts.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page of results"),
    }),
    outputSchema: z.object({
      containers: z.array(ContainerSchema).describe("List of containers"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listContainers(
        context.accountId,
        context.pageToken,
      );

      return {
        containers: (response.container || []).map((container) => ({
          path: container.path,
          accountId: container.accountId,
          containerId: container.containerId,
          name: container.name,
          publicId: container.publicId,
          usageContext: container.usageContext,
          fingerprint: container.fingerprint,
          tagManagerUrl: container.tagManagerUrl,
          domainName: container.domainName,
          notes: container.notes,
          taggingServerUrls: container.taggingServerUrls,
        })),
        nextPageToken: response.nextPageToken,
      };
    },
  });

// ============================================================================
// Get Container Tool
// ============================================================================

export const createGetContainerTool = (env: Env) =>
  createPrivateTool({
    id: "get_container",
    description: "Get detailed information about a specific GTM container.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID (e.g., '67890')"),
    }),
    outputSchema: z.object({
      container: ContainerSchema.describe("Container details"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const container = await client.getContainer(
        context.accountId,
        context.containerId,
      );

      return {
        container: {
          path: container.path,
          accountId: container.accountId,
          containerId: container.containerId,
          name: container.name,
          publicId: container.publicId,
          usageContext: container.usageContext,
          fingerprint: container.fingerprint,
          tagManagerUrl: container.tagManagerUrl,
          domainName: container.domainName,
          notes: container.notes,
          taggingServerUrls: container.taggingServerUrls,
        },
      };
    },
  });

// ============================================================================
// Create Container Tool
// ============================================================================

export const createCreateContainerTool = (env: Env) =>
  createPrivateTool({
    id: "create_container",
    description: "Create a new GTM container in an account.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      name: z.string().describe("Container name"),
      usageContext: z
        .array(ContainerUsageContextSchema)
        .describe("Usage contexts: web, android, ios, amp, or server"),
      domainName: z
        .array(z.string())
        .optional()
        .describe("Associated domain names for web containers"),
      notes: z.string().optional().describe("Container notes"),
    }),
    outputSchema: z.object({
      container: ContainerSchema.describe("Created container"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const container = await client.createContainer(context.accountId, {
        name: context.name,
        usageContext: context.usageContext,
        domainName: context.domainName,
        notes: context.notes,
      });

      return {
        container: {
          path: container.path,
          accountId: container.accountId,
          containerId: container.containerId,
          name: container.name,
          publicId: container.publicId,
          usageContext: container.usageContext,
          fingerprint: container.fingerprint,
          tagManagerUrl: container.tagManagerUrl,
          domainName: container.domainName,
          notes: container.notes,
          taggingServerUrls: container.taggingServerUrls,
        },
      };
    },
  });

// ============================================================================
// Delete Container Tool
// ============================================================================

export const createDeleteContainerTool = (env: Env) =>
  createPrivateTool({
    id: "delete_container",
    description:
      "Delete a GTM container. Warning: This action cannot be undone.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
      containerId: z.string().describe("Container ID to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the deletion was successful"),
      message: z.string().describe("Result message"),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteContainer(context.accountId, context.containerId);

      return {
        success: true,
        message: `Container ${context.containerId} deleted successfully`,
      };
    },
  });

// ============================================================================
// Export all container tools
// ============================================================================

export const containerTools = [
  createListContainersTool,
  createGetContainerTool,
  createCreateContainerTool,
  createDeleteContainerTool,
];
