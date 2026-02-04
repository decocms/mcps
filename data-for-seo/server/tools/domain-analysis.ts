import type { Env } from "../types/env.ts";
import { getClientFromEnv } from "../lib/dataforseo.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  rankedKeywordsInputSchema,
  rankedKeywordsOutputSchema,
  domainRankInputSchema,
  domainRankOutputSchema,
  competitorsDomainInputSchema,
  competitorsDomainOutputSchema,
} from "./schemas.ts";

export const createRankedKeywordsTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_RANKED_KEYWORDS",
    description:
      "[ASYNC - DataForSEO Labs] Get ALL keywords a domain ranks for in Google, with positions, search volume, and estimated traffic. Perfect for competitive analysis and discovering keyword opportunities. Response time: 5-15 seconds. Cost: ~0.02 credits per request (excellent value for comprehensive keyword data!).",
    inputSchema: rankedKeywordsInputSchema,
    outputSchema: rankedKeywordsOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getRankedKeywords(
        context.target,
        context.languageName,
        context.locationName,
        context.languageCode,
        context.locationCode,
        context.limit,
        context.offset,
      );
      return { data: result };
    },
  });

export const createDomainRankTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_DOMAIN_RANK",
    description:
      "[ASYNC - DataForSEO Labs] Get comprehensive domain authority metrics including rank score, total organic keywords count, estimated traffic, and visibility metrics. Complements backlinks data with overall domain authority assessment. Response time: 2-5 seconds. Cost: ~0.01 credits per request (very affordable!).",
    inputSchema: domainRankInputSchema,
    outputSchema: domainRankOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getDomainRank(context.target);
      return { data: result };
    },
  });

export const createCompetitorsDomainTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_COMPETITORS_DOMAIN",
    description:
      "[ASYNC - DataForSEO Labs] Automatically discover competitor domains based on common keyword rankings. Returns domains that compete for the same keywords with metrics on keyword overlap, estimated traffic, and competitive strength. Perfect for competitive intelligence and market analysis. Response time: 5-12 seconds. Cost: ~0.05 credits per request (great value for automated competitor discovery!).",
    inputSchema: competitorsDomainInputSchema,
    outputSchema: competitorsDomainOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getCompetitorsDomain(
        context.target,
        context.languageName,
        context.locationName,
        context.languageCode,
        context.locationCode,
        context.limit,
      );
      return { data: result };
    },
  });

export const domainAnalysisTools = [
  createRankedKeywordsTool,
  createDomainRankTool,
  createCompetitorsDomainTool,
];
