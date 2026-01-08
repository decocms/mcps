/**
 * Keyword Management Tools
 *
 * Tools for listing, creating, updating, and managing Google Ads keywords
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GoogleAdsClient, getAccessToken } from "../lib/google-ads-client.ts";
import type { KeywordMatchType, AdGroupCriterionStatus } from "../lib/types.ts";

// ============================================================================
// List Keywords Tool
// ============================================================================

export const createListKeywordsTool = (env: Env) =>
  createPrivateTool({
    id: "list_keywords",
    description:
      "List keywords for a Google Ads customer account. Can optionally filter by ad group.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupId: z
        .string()
        .optional()
        .describe("Optional ad group ID to filter keywords"),
    }),
    outputSchema: z.object({
      keywords: z.array(
        z.object({
          resourceName: z.string(),
          criterionId: z.string(),
          adGroup: z.string(),
          text: z.string(),
          matchType: z.string(),
          status: z.string(),
          cpcBidMicros: z.string().optional(),
          negative: z.boolean().optional(),
          qualityScore: z.number().optional(),
        }),
      ),
      count: z.number(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const keywords = await client.listKeywords(
        context.customerId,
        context.adGroupId,
      );

      return {
        keywords: keywords.map((keyword) => ({
          resourceName: keyword.resourceName,
          criterionId: keyword.criterionId,
          adGroup: keyword.adGroup,
          text: keyword.keyword?.text || "",
          matchType: keyword.keyword?.matchType || "UNKNOWN",
          status: keyword.status,
          cpcBidMicros: keyword.cpcBidMicros,
          negative: keyword.negative,
          qualityScore: keyword.qualityInfo?.qualityScore,
        })),
        count: keywords.length,
      };
    },
  });

// ============================================================================
// Get Keyword Tool
// ============================================================================

export const createGetKeywordTool = (env: Env) =>
  createPrivateTool({
    id: "get_keyword",
    description:
      "Get detailed information about a specific Google Ads keyword including quality score and bid estimates.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupId: z.string().describe("Ad group ID"),
      criterionId: z.string().describe("Keyword criterion ID"),
    }),
    outputSchema: z.object({
      keyword: z
        .object({
          resourceName: z.string(),
          criterionId: z.string(),
          adGroup: z.string(),
          text: z.string(),
          matchType: z.string(),
          status: z.string(),
          cpcBidMicros: z.string().optional(),
          negative: z.boolean().optional(),
          qualityScore: z.number().optional(),
          firstPageCpcMicros: z.string().optional(),
          topOfPageCpcMicros: z.string().optional(),
        })
        .nullable(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const keyword = await client.getKeyword(
        context.customerId,
        context.adGroupId,
        context.criterionId,
      );

      if (!keyword) {
        return { keyword: null };
      }

      return {
        keyword: {
          resourceName: keyword.resourceName,
          criterionId: keyword.criterionId,
          adGroup: keyword.adGroup,
          text: keyword.keyword?.text || "",
          matchType: keyword.keyword?.matchType || "UNKNOWN",
          status: keyword.status,
          cpcBidMicros: keyword.cpcBidMicros,
          negative: keyword.negative,
          qualityScore: keyword.qualityInfo?.qualityScore,
          firstPageCpcMicros: keyword.positionEstimates?.firstPageCpcMicros,
          topOfPageCpcMicros: keyword.positionEstimates?.topOfPageCpcMicros,
        },
      };
    },
  });

// ============================================================================
// Create Keyword Tool
// ============================================================================

export const createCreateKeywordTool = (env: Env) =>
  createPrivateTool({
    id: "create_keyword",
    description:
      "Add a new keyword to a Google Ads ad group. Keywords trigger your ads to show when users search for related terms.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupResourceName: z
        .string()
        .describe(
          "Ad group resource name (e.g., 'customers/123/adGroups/456')",
        ),
      text: z.string().describe("Keyword text (e.g., 'running shoes')"),
      matchType: z
        .enum(["EXACT", "PHRASE", "BROAD"])
        .describe(
          "Match type: EXACT (most specific), PHRASE (moderate), BROAD (widest reach)",
        ),
      cpcBidMicros: z
        .string()
        .optional()
        .describe(
          "Max CPC bid in micros (1 dollar = 1,000,000 micros). E.g., '500000' for $0.50",
        ),
      finalUrls: z
        .array(z.string())
        .optional()
        .describe("Optional landing page URLs specific to this keyword"),
      negative: z
        .boolean()
        .optional()
        .describe(
          "Set to true to create a negative keyword (blocks ads from showing)",
        ),
      status: z
        .enum(["ENABLED", "PAUSED"])
        .optional()
        .default("ENABLED")
        .describe("Initial keyword status (default: ENABLED)"),
    }),
    outputSchema: z.object({
      resourceName: z.string().describe("Created keyword resource name"),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.createKeyword(context.customerId, {
        adGroup: context.adGroupResourceName,
        status: (context.status || "ENABLED") as AdGroupCriterionStatus,
        keyword: {
          text: context.text,
          matchType: context.matchType as KeywordMatchType,
        },
        cpcBidMicros: context.cpcBidMicros,
        finalUrls: context.finalUrls,
        negative: context.negative,
      });

      const resourceName = response.results[0]?.resourceName;
      if (!resourceName) {
        throw new Error("Failed to create keyword");
      }

      return {
        resourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Create Negative Keyword Tool
// ============================================================================

export const createCreateNegativeKeywordTool = (env: Env) =>
  createPrivateTool({
    id: "create_negative_keyword",
    description:
      "Add a negative keyword to a Google Ads ad group. Negative keywords prevent your ads from showing for certain searches.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      adGroupResourceName: z
        .string()
        .describe(
          "Ad group resource name (e.g., 'customers/123/adGroups/456')",
        ),
      text: z
        .string()
        .describe(
          "Negative keyword text (e.g., 'free' to block searches containing 'free')",
        ),
      matchType: z
        .enum(["EXACT", "PHRASE", "BROAD"])
        .describe("Match type for the negative keyword"),
    }),
    outputSchema: z.object({
      resourceName: z
        .string()
        .describe("Created negative keyword resource name"),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.createKeyword(context.customerId, {
        adGroup: context.adGroupResourceName,
        status: "ENABLED",
        keyword: {
          text: context.text,
          matchType: context.matchType as KeywordMatchType,
        },
        negative: true,
      });

      const resourceName = response.results[0]?.resourceName;
      if (!resourceName) {
        throw new Error("Failed to create negative keyword");
      }

      return {
        resourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Update Keyword Tool
// ============================================================================

export const createUpdateKeywordTool = (env: Env) =>
  createPrivateTool({
    id: "update_keyword",
    description:
      "Update an existing Google Ads keyword. Can change status, bid, or landing page URLs.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      keywordResourceName: z
        .string()
        .describe(
          "Keyword resource name (e.g., 'customers/123/adGroupCriteria/456~789')",
        ),
      status: z
        .enum(["ENABLED", "PAUSED", "REMOVED"])
        .optional()
        .describe("New keyword status"),
      cpcBidMicros: z.string().optional().describe("New max CPC bid in micros"),
      finalUrls: z
        .array(z.string())
        .optional()
        .describe("New landing page URLs"),
    }),
    outputSchema: z.object({
      resourceName: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.updateKeyword(context.customerId, {
        resourceName: context.keywordResourceName,
        status: context.status as AdGroupCriterionStatus | undefined,
        cpcBidMicros: context.cpcBidMicros,
        finalUrls: context.finalUrls,
      });

      return {
        resourceName:
          response.results[0]?.resourceName || context.keywordResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Pause Keyword Tool
// ============================================================================

export const createPauseKeywordTool = (env: Env) =>
  createPrivateTool({
    id: "pause_keyword",
    description:
      "Pause a Google Ads keyword. Sets the keyword status to PAUSED.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      keywordResourceName: z
        .string()
        .describe(
          "Keyword resource name (e.g., 'customers/123/adGroupCriteria/456~789')",
        ),
    }),
    outputSchema: z.object({
      resourceName: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      await client.updateKeywordStatus(
        context.customerId,
        context.keywordResourceName,
        "PAUSED",
      );

      return {
        resourceName: context.keywordResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Enable Keyword Tool
// ============================================================================

export const createEnableKeywordTool = (env: Env) =>
  createPrivateTool({
    id: "enable_keyword",
    description:
      "Enable a Google Ads keyword. Sets the keyword status to ENABLED.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      keywordResourceName: z
        .string()
        .describe(
          "Keyword resource name (e.g., 'customers/123/adGroupCriteria/456~789')",
        ),
    }),
    outputSchema: z.object({
      resourceName: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      await client.updateKeywordStatus(
        context.customerId,
        context.keywordResourceName,
        "ENABLED",
      );

      return {
        resourceName: context.keywordResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Remove Keyword Tool
// ============================================================================

export const createRemoveKeywordTool = (env: Env) =>
  createPrivateTool({
    id: "remove_keyword",
    description:
      "Remove a Google Ads keyword. This permanently deletes the keyword from the ad group.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe("Google Ads customer ID (e.g., '1234567890')"),
      keywordResourceName: z
        .string()
        .describe(
          "Keyword resource name (e.g., 'customers/123/adGroupCriteria/456~789')",
        ),
    }),
    outputSchema: z.object({
      resourceName: z.string(),
      success: z.boolean(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      await client.removeKeyword(
        context.customerId,
        context.keywordResourceName,
      );

      return {
        resourceName: context.keywordResourceName,
        success: true,
      };
    },
  });

// ============================================================================
// Export all keyword tools
// ============================================================================

export const keywordTools = [
  createListKeywordsTool,
  createGetKeywordTool,
  createCreateKeywordTool,
  createCreateNegativeKeywordTool,
  createUpdateKeywordTool,
  createPauseKeywordTool,
  createEnableKeywordTool,
  createRemoveKeywordTool,
];
