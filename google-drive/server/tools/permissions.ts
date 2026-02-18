/**
 * Permission and Sharing Tools
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { DriveClient, getAccessToken } from "../lib/drive-client.ts";

const PermissionSchema = z
  .object({
    id: z.string(),
    type: z.enum(["user", "group", "domain", "anyone"]),
    role: z.enum([
      "owner",
      "organizer",
      "fileOrganizer",
      "writer",
      "commenter",
      "reader",
    ]),
    emailAddress: z.string().optional(),
    domain: z.string().optional(),
    displayName: z.string().optional(),
  })
  .passthrough();

export const createListPermissionsTool = (env: Env) =>
  createPrivateTool({
    id: "list_permissions",
    description: "List all permissions for a file/folder.",
    inputSchema: z.object({
      fileId: z.string().describe("File or folder ID"),
    }),
    outputSchema: z.object({
      permissions: z.array(PermissionSchema),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      const permissions = await client.listPermissions(context.fileId);
      return { permissions, count: permissions.length };
    },
  });

export const createCreatePermissionTool = (env: Env) =>
  createPrivateTool({
    id: "create_permission",
    description:
      "Share a file/folder with a user, group, domain, or make it public.",
    inputSchema: z
      .object({
        fileId: z.string().describe("File or folder ID"),
        type: z
          .enum(["user", "group", "domain", "anyone"])
          .describe("Who to share with"),
        role: z
          .enum([
            "owner",
            "organizer",
            "fileOrganizer",
            "writer",
            "commenter",
            "reader",
          ])
          .describe("Permission level"),
        emailAddress: z
          .string()
          .optional()
          .describe("Email (required for user/group type)"),
        domain: z
          .string()
          .optional()
          .describe("Domain (required for domain type)"),
        sendNotification: z
          .boolean()
          .optional()
          .describe("Send email notification (default true)"),
        emailMessage: z
          .string()
          .optional()
          .describe("Custom message for notification email"),
      })
      .refine(
        (data) => {
          if (data.type === "user" || data.type === "group") {
            return !!data.emailAddress;
          }
          if (data.type === "domain") {
            return !!data.domain;
          }
          return true;
        },
        {
          message:
            "emailAddress is required for user/group type, domain is required for domain type",
        },
      ),
    outputSchema: z.object({
      permission: PermissionSchema,
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      const permission = await client.createPermission(
        context.fileId,
        {
          type: context.type,
          role: context.role,
          emailAddress: context.emailAddress,
          domain: context.domain,
        },
        context.sendNotification ?? true,
        context.emailMessage,
      );
      return { permission, success: true };
    },
  });

export const createDeletePermissionTool = (env: Env) =>
  createPrivateTool({
    id: "delete_permission",
    description: "Remove a permission from a file/folder (unshare).",
    inputSchema: z.object({
      fileId: z.string().describe("File or folder ID"),
      permissionId: z.string().describe("Permission ID to remove"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      await client.deletePermission(context.fileId, context.permissionId);
      return { success: true, message: "Permission removed" };
    },
  });

export const createShareFileTool = (env: Env) =>
  createPrivateTool({
    id: "share_file",
    description: "Quick share: share a file with a user by email.",
    inputSchema: z.object({
      fileId: z.string().describe("File ID"),
      email: z.string().describe("Email address to share with"),
      role: z
        .enum(["writer", "commenter", "reader"])
        .describe("Permission level"),
      sendNotification: z
        .boolean()
        .optional()
        .describe("Send email notification"),
      message: z.string().optional().describe("Custom message"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      await client.createPermission(
        context.fileId,
        { type: "user", role: context.role, emailAddress: context.email },
        context.sendNotification ?? true,
        context.message,
      );
      return {
        success: true,
        message: `File shared with ${context.email} as ${context.role}`,
      };
    },
  });

export const createGetSharingLinkTool = (env: Env) =>
  createPrivateTool({
    id: "get_sharing_link",
    description:
      "Get the sharing link for a file (optionally make it public first).",
    inputSchema: z.object({
      fileId: z.string().describe("File ID"),
      makePublic: z
        .boolean()
        .optional()
        .describe("Make file publicly accessible via link"),
    }),
    outputSchema: z.object({
      webViewLink: z.string(),
      webContentLink: z.string().optional(),
      isPublic: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new DriveClient({ accessToken: getAccessToken(env) });
      if (context.makePublic) {
        await client.createPermission(
          context.fileId,
          { type: "anyone", role: "reader" },
          false,
        );
      }
      const file = await client.getFile(context.fileId);
      const permissions = await client.listPermissions(context.fileId);
      const isPublic = permissions.some((p) => p.type === "anyone");
      return {
        webViewLink: file.webViewLink || "",
        webContentLink: file.webContentLink,
        isPublic,
      };
    },
  });

export const permissionTools = [
  createListPermissionsTool,
  createCreatePermissionTool,
  createDeletePermissionTool,
  createShareFileTool,
  createGetSharingLinkTool,
];
