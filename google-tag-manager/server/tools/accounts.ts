/**
 * Account Management Tools
 *
 * Tools for listing and getting GTM accounts
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GTMClient, getAccessToken } from "../lib/gtm-client.ts";

// ============================================================================
// List Accounts Tool
// ============================================================================

export const createListAccountsTool = (env: Env) =>
  createPrivateTool({
    id: "list_accounts",
    description:
      "List all GTM accounts accessible by the authenticated user. Returns account IDs, names, and metadata.",
    inputSchema: z.object({
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page of results"),
    }),
    outputSchema: z.object({
      accounts: z.array(
        z.object({
          path: z.string(),
          accountId: z.string(),
          name: z.string(),
          shareData: z.boolean().optional(),
          fingerprint: z.string().optional(),
          tagManagerUrl: z.string().optional(),
          features: z
            .object({
              supportUserPermissions: z.boolean().optional(),
              supportMultipleContainers: z.boolean().optional(),
            })
            .optional(),
        }),
      ),
      nextPageToken: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listAccounts(context.pageToken);

      const accounts = (response.account || []).map((acc) => ({
        path: acc.path,
        accountId: acc.accountId,
        name: acc.name,
        ...(acc.shareData !== undefined && { shareData: acc.shareData }),
        ...(acc.fingerprint && { fingerprint: acc.fingerprint }),
        ...(acc.tagManagerUrl && { tagManagerUrl: acc.tagManagerUrl }),
        ...(acc.features && { features: acc.features }),
      }));

      return {
        accounts,
        ...(response.nextPageToken && {
          nextPageToken: response.nextPageToken,
        }),
      };
    },
  });

// ============================================================================
// Get Account Tool
// ============================================================================

export const createGetAccountTool = (env: Env) =>
  createPrivateTool({
    id: "get_account",
    description:
      "Get detailed information about a specific GTM account by its ID.",
    inputSchema: z.object({
      accountId: z.string().describe("Account ID (e.g., '12345')"),
    }),
    outputSchema: z.object({
      account: z.object({
        path: z.string(),
        accountId: z.string(),
        name: z.string(),
        shareData: z.boolean().optional(),
        fingerprint: z.string().optional(),
        tagManagerUrl: z.string().optional(),
        features: z
          .object({
            supportUserPermissions: z.boolean().optional(),
            supportMultipleContainers: z.boolean().optional(),
          })
          .optional(),
      }),
    }),
    execute: async ({ context }) => {
      const client = new GTMClient({
        accessToken: getAccessToken(env),
      });

      const account = await client.getAccount(context.accountId);

      return {
        account: {
          path: account.path,
          accountId: account.accountId,
          name: account.name,
          ...(account.shareData !== undefined && {
            shareData: account.shareData,
          }),
          ...(account.fingerprint && { fingerprint: account.fingerprint }),
          ...(account.tagManagerUrl && {
            tagManagerUrl: account.tagManagerUrl,
          }),
          ...(account.features && { features: account.features }),
        },
      };
    },
  });

// ============================================================================
// Export all account tools
// ============================================================================

export const accountTools = [createListAccountsTool, createGetAccountTool];
