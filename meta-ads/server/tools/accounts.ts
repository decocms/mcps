/**
 * Account-related tools for Meta Ads
 *
 * Tools:
 * - META_ADS_GET_AD_ACCOUNTS: List ad accounts accessible by user
 * - META_ADS_GET_ACCOUNT_INFO: Get detailed info about a specific account
 * - META_ADS_GET_ACCOUNT_PAGES: Get pages associated with an account
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getMetaAccessToken } from "../main.ts";
import { createMetaAdsClient } from "../lib/meta-client.ts";
import { ACCOUNT_STATUSES } from "../constants.ts";

/**
 * Get all ad accounts accessible by the current user (User Token only)
 */
export const createGetUserAdAccountsTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_USER_AD_ACCOUNTS",
    description:
      "Get all ad accounts accessible by the current authenticated user (requires User Access Token). Returns account ID, name, status, currency, timezone, and amount spent.",
    inputSchema: z.object({
      user_id: z
        .string()
        .optional()
        .prefault("me")
        .describe("Meta user ID or 'me' for the current user"),
      limit: z.coerce
        .number()
        .optional()
        .prefault(50)
        .describe("Maximum number of accounts to return (default: 50)"),
    }),
    outputSchema: z.object({
      accounts: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          account_id: z.string(),
          status: z.string(),
          currency: z.string(),
          timezone: z.string(),
          amount_spent: z.string(),
          business_name: z.string().optional(),
        }),
      ),
      count: z.number().describe("Number of accounts returned"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.getUserAdAccounts(
        context.user_id,
        context.limit,
      );

      return {
        accounts: response.data.map((account) => ({
          id: account.id,
          name: account.name,
          account_id: account.account_id,
          status:
            ACCOUNT_STATUSES[
              account.account_status as keyof typeof ACCOUNT_STATUSES
            ] || `UNKNOWN (${account.account_status})`,
          currency: account.currency,
          timezone: account.timezone_name,
          amount_spent: account.amount_spent,
          business_name: account.business_name,
        })),
        count: response.data.length,
      };
    },
  });

/**
 * Get all ad accounts associated with the current page (Page Token only)
 */
export const createGetPageAdAccountsTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_PAGE_AD_ACCOUNTS",
    description:
      "Get all ad accounts associated with the current page (requires Page Access Token). Returns account ID, name, status, currency, timezone, and amount spent.",
    inputSchema: z.object({
      limit: z.coerce
        .number()
        .optional()
        .prefault(50)
        .describe("Maximum number of accounts to return (default: 50)"),
    }),
    outputSchema: z.object({
      accounts: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          account_id: z.string(),
          status: z.string(),
          currency: z.string(),
          timezone: z.string(),
          amount_spent: z.string(),
          business_name: z.string().optional(),
        }),
      ),
      count: z.number().describe("Number of accounts returned"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.getPageAdAccounts(context.limit);

      return {
        accounts: response.data.map((account) => ({
          id: account.id,
          name: account.name,
          account_id: account.account_id,
          status:
            ACCOUNT_STATUSES[
              account.account_status as keyof typeof ACCOUNT_STATUSES
            ] || `UNKNOWN (${account.account_status})`,
          currency: account.currency,
          timezone: account.timezone_name,
          amount_spent: account.amount_spent,
          business_name: account.business_name,
        })),
        count: response.data.length,
      };
    },
  });

/**
 * Get detailed information about a specific ad account
 */
export const createGetAccountInfoTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_ACCOUNT_INFO",
    description:
      "Get detailed information about a specific Meta Ads account including currency, timezone, spending limits, and balance.",
    inputSchema: z.object({
      account_id: z
        .string()
        .describe("Meta Ads account ID (format: act_XXXXXXXXX)"),
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      account_id: z.string(),
      status: z.string(),
      currency: z.string(),
      timezone: z.string(),
      timezone_offset_hours: z.number(),
      business_name: z.string().optional(),
      amount_spent: z.string(),
      spend_cap: z.string().optional(),
      balance: z.string().optional(),
      min_daily_budget: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const account = await client.getAccountInfo(context.account_id);

      return {
        id: account.id,
        name: account.name,
        account_id: account.account_id,
        status:
          ACCOUNT_STATUSES[
            account.account_status as keyof typeof ACCOUNT_STATUSES
          ] || `UNKNOWN (${account.account_status})`,
        currency: account.currency,
        timezone: account.timezone_name,
        timezone_offset_hours: account.timezone_offset_hours_utc,
        business_name: account.business_name,
        amount_spent: account.amount_spent,
        spend_cap: account.spend_cap,
        balance: account.balance,
        min_daily_budget: account.min_daily_budget
          ? String(account.min_daily_budget)
          : undefined,
      };
    },
  });

/**
 * Get information about the authenticated user
 */
export const createGetUserInfoTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_USER_INFO",
    description:
      "Get information about the currently authenticated Meta user including user ID and name. Use this to get the user_id needed for other operations.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      id: z.string().describe("Meta user ID"),
      name: z.string().optional().describe("User's display name"),
    }),
    execute: async () => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const user = await client.getUserInfo();

      return {
        id: user.id,
        name: user.name,
      };
    },
  });

/**
 * Get pages associated with the current user (User Token only)
 */
export const createGetUserAccountPagesTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_USER_ACCOUNT_PAGES",
    description:
      "Get Facebook/Instagram pages associated with the current authenticated user (requires User Access Token). Useful for understanding which pages can be used for advertising.",
    inputSchema: z.object({
      limit: z.coerce
        .number()
        .optional()
        .prefault(50)
        .describe("Maximum number of pages to return (default: 50)"),
    }),
    outputSchema: z.object({
      pages: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          category: z.string().optional(),
          tasks: z.array(z.string()).optional(),
        }),
      ),
      count: z.number().describe("Number of pages returned"),
    }),
    execute: async ({ context }) => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const response = await client.getUserAccountPages(context.limit);

      return {
        pages: response.data.map((page) => ({
          id: page.id,
          name: page.name,
          category: page.category,
          tasks: page.tasks,
        })),
        count: response.data.length,
      };
    },
  });

/**
 * Get information about the current page (Page Token only)
 */
export const createGetPageInfoTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_PAGE_INFO",
    description:
      "Get information about the currently authenticated page (requires Page Access Token). Returns page ID, name, category, and tasks.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      id: z.string().describe("Page ID"),
      name: z.string().optional().describe("Page name"),
      category: z.string().optional().describe("Page category"),
      tasks: z.array(z.string()).optional().describe("Page tasks/permissions"),
      about: z.string().optional().describe("Page description"),
      website: z.string().optional().describe("Page website"),
      phone: z.string().optional().describe("Page phone number"),
    }),
    execute: async () => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const page = await client.getPageInfo();

      return {
        id: page.id,
        name: page.name,
        category: page.category,
        tasks: page.tasks,
        about: page.about,
        website: page.website,
        phone: page.phone,
      };
    },
  });

/**
 * Get the current page information (Page Token only)
 * This is an alias for META_ADS_GET_PAGE_INFO but returns in pages array format for consistency
 */
export const createGetPageAccountPagesTool = (env: Env) =>
  createPrivateTool({
    id: "META_ADS_GET_PAGE_ACCOUNT_PAGES",
    description:
      "Get information about the currently authenticated page (requires Page Access Token). Returns page details in a consistent format.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      pages: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          category: z.string().optional(),
          tasks: z.array(z.string()).optional(),
        }),
      ),
      count: z
        .number()
        .describe("Number of pages returned (always 1 for Page Token)"),
    }),
    execute: async () => {
      const accessToken = await getMetaAccessToken(env);
      const client = createMetaAdsClient({ accessToken });

      const page = await client.getPageAccountPages();

      return {
        pages: [
          {
            id: page.id,
            name: page.name,
            category: page.category,
            tasks: page.tasks,
          },
        ],
        count: 1,
      };
    },
  });

// Export all account tools
export const accountTools = [
  // User Token Tools
  createGetUserInfoTool,
  createGetUserAdAccountsTool,
  createGetUserAccountPagesTool,
  // Page Token Tools
  createGetPageInfoTool,
  createGetPageAdAccountsTool,
  createGetPageAccountPagesTool,
  // Universal Tools (work with both)
  createGetAccountInfoTool,
];
