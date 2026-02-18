/**
 * URL Inspection Tools
 *
 * Tools for inspecting URL index status
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import {
  SearchConsoleClient,
  getAccessToken,
} from "../lib/search-console-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const VerdictSchema = z.enum([
  "PASS",
  "PARTIAL",
  "FAIL",
  "NEUTRAL",
  "VERDICT_UNSPECIFIED",
]);

const RobotsTxtStateSchema = z.enum([
  "ALLOWED",
  "DISALLOWED",
  "HTTP_503",
  "NOT_FETCHED",
  "ROBOTS_TXT_STATE_UNSPECIFIED",
]);

const IndexingStateSchema = z.enum([
  "INDEXING_ALLOWED",
  "INDEXING_ALLOWED_WITH_WARNING",
  "INDEXING_DISALLOWED",
  "BLOCKED_BY_NOINDEX",
  "BLOCKED_BY_ROBOTS_TXT",
  "INDEXING_STATE_UNSPECIFIED",
]);

const PageFetchStateSchema = z.enum([
  "SUCCESSFUL",
  "SOFT_404",
  "BLOCKED_ROBOTS_TXT",
  "NOT_FOUND",
  "ACCESS_DENIED",
  "SERVER_ERROR",
  "REDIRECT_ERROR",
  "ACCESS_FORBIDDEN",
  "BLOCKED_4XX",
  "INTERNAL_CRAWL_ERROR",
  "INVALID_URL",
  "PAGE_FETCH_STATE_UNSPECIFIED",
]);

const CrawlingUserAgentSchema = z.enum([
  "CRAWLING_USER_AGENT_UNSPECIFIED",
  "DESKTOP",
  "MOBILE",
]);

const IndexStatusInspectionResultSchema = z.object({
  verdict: VerdictSchema.optional(),
  coverageState: z.string().optional(),
  robotsTxtState: RobotsTxtStateSchema.optional(),
  indexingState: IndexingStateSchema.optional(),
  lastCrawlTime: z.string().optional(),
  pageFetchState: PageFetchStateSchema.optional(),
  googleCanonical: z.string().optional(),
  userCanonical: z.string().optional(),
  crawledAs: CrawlingUserAgentSchema.optional(),
  referringUrls: z.array(z.string()).optional(),
  sitemap: z.array(z.string()).optional(),
});

const AmpInspectionResultSchema = z.object({
  verdict: VerdictSchema.optional(),
  issues: z
    .array(
      z.object({
        severity: z.enum(["ERROR", "WARNING", "INFO"]),
        issueMessage: z.string().optional(),
      }),
    )
    .optional(),
  ampIndexStateVerdict: VerdictSchema.optional(),
  indexStatusVerdict: VerdictSchema.optional(),
  lastAmpCrawlTime: z.string().optional(),
  lastAmpIndexTime: z.string().optional(),
  ampUrl: z.string().optional(),
  ampIndexState: z.string().optional(),
});

const MobileUsabilityInspectionResultSchema = z.object({
  verdict: VerdictSchema.optional(),
  issues: z
    .array(
      z.object({
        severity: z.enum(["ERROR", "WARNING", "INFO"]),
        issueMessage: z.string().optional(),
      }),
    )
    .optional(),
});

const RichResultsInspectionResultSchema = z.object({
  verdict: VerdictSchema.optional(),
  detectedItems: z
    .array(
      z.object({
        richResultType: z.string().optional(),
        items: z
          .array(
            z.object({
              name: z.string().optional(),
              invalidArgument: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

const UrlInspectionResultSchema = z.object({
  inspectionResultLink: z.string().optional(),
  indexStatusResult: IndexStatusInspectionResultSchema.optional(),
  ampResult: AmpInspectionResultSchema.optional(),
  mobileUsabilityResult: MobileUsabilityInspectionResultSchema.optional(),
  richResultsResult: RichResultsInspectionResultSchema.optional(),
});

// ============================================================================
// Inspect URL Tool
// ============================================================================

export const createInspectUrlTool = (env: Env) =>
  createPrivateTool({
    id: "inspect_url",
    description:
      "Inspect a URL's Google index status, including indexing state, mobile usability, AMP status, and rich results",
    inputSchema: z.object({
      siteUrl: z
        .string()
        .describe(
          "Site URL (e.g., 'sc-domain:example.com' or 'https://example.com/')",
        ),
      inspectionUrl: z.string().url().describe("URL to inspect (full URL)"),
      languageCode: z
        .string()
        .optional()
        .describe("Language code (e.g., 'en', 'pt-BR') for localized results"),
    }),
    outputSchema: z.object({
      inspectionResult: UrlInspectionResultSchema,
    }),
    execute: async ({ context }) => {
      const client = new SearchConsoleClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.inspectUrl({
        siteUrl: context.siteUrl,
        inspectionUrl: context.inspectionUrl,
        languageCode: context.languageCode,
      });

      const inspectionResult = result.inspectionResult || {};

      return {
        inspectionResult: {
          inspectionResultLink: inspectionResult.inspectionResultLink,
          indexStatusResult: inspectionResult.indexStatusResult
            ? {
                verdict: inspectionResult.indexStatusResult.verdict,
                coverageState: inspectionResult.indexStatusResult.coverageState,
                robotsTxtState:
                  inspectionResult.indexStatusResult.robotsTxtState,
                indexingState: inspectionResult.indexStatusResult.indexingState,
                lastCrawlTime: inspectionResult.indexStatusResult.lastCrawlTime,
                pageFetchState:
                  inspectionResult.indexStatusResult.pageFetchState,
                googleCanonical:
                  inspectionResult.indexStatusResult.googleCanonical,
                userCanonical: inspectionResult.indexStatusResult.userCanonical,
                crawledAs: inspectionResult.indexStatusResult.crawledAs,
                referringUrls: inspectionResult.indexStatusResult.referringUrls,
                sitemap: inspectionResult.indexStatusResult.sitemap,
              }
            : undefined,
          ampResult: inspectionResult.ampResult
            ? {
                verdict: inspectionResult.ampResult.verdict,
                issues: inspectionResult.ampResult.issues,
                ampIndexStateVerdict:
                  inspectionResult.ampResult.ampIndexStateVerdict,
                indexStatusVerdict:
                  inspectionResult.ampResult.indexStatusVerdict,
                lastAmpCrawlTime: inspectionResult.ampResult.lastAmpCrawlTime,
                lastAmpIndexTime: inspectionResult.ampResult.lastAmpIndexTime,
                ampUrl: inspectionResult.ampResult.ampUrl,
                ampIndexState: inspectionResult.ampResult.ampIndexState,
              }
            : undefined,
          mobileUsabilityResult: inspectionResult.mobileUsabilityResult
            ? {
                verdict: inspectionResult.mobileUsabilityResult.verdict,
                issues: inspectionResult.mobileUsabilityResult.issues,
              }
            : undefined,
          richResultsResult: inspectionResult.richResultsResult
            ? {
                verdict: inspectionResult.richResultsResult.verdict,
                detectedItems: inspectionResult.richResultsResult.detectedItems,
              }
            : undefined,
        },
      };
    },
  });

// ============================================================================
// Export all URL inspection tools
// ============================================================================

export const urlInspectionTools = [createInspectUrlTool];
