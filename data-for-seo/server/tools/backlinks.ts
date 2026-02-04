import type { Env } from "../types/env.ts";
import { getClientFromEnv } from "../lib/dataforseo.ts";
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  backlinksOverviewInputSchema,
  backlinksOverviewOutputSchema,
  backlinksInputSchema,
  backlinksOutputSchema,
  referringDomainsInputSchema,
  referringDomainsOutputSchema,
} from "./schemas.ts";

export const createBacklinksOverviewTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_BACKLINKS_OVERVIEW",
    description:
      "[ASYNC - Backlinks Summary] Get comprehensive backlinks overview for any domain or URL. Returns total backlinks count, referring domains, dofollow/nofollow ratio, gov/edu domains, domain rank, and broken backlinks. Takes 2-4 seconds. Cost: ~0.05 credits per request. Available in all plans.",
    inputSchema: backlinksOverviewInputSchema,
    outputSchema: backlinksOverviewOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getBacklinksOverview(context.target);
      return { data: result };
    },
  });

export const createBacklinksTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_BACKLINKS",
    description:
      "[ASYNC - Detailed Backlinks] Get paginated detailed list of individual backlinks pointing to a domain or URL. Returns source URL, anchor text, dofollow/nofollow status, domain rank, first seen date, and more. Use limit/offset for pagination (max 1000 per request). Takes 3-8 seconds. Cost: ~0.05 credits per request. Available in all plans.",
    inputSchema: backlinksInputSchema,
    outputSchema: backlinksOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getBacklinks(
        context.target,
        context.limit,
        context.offset,
      );
      return { data: result };
    },
  });

export const createReferringDomainsTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_REFERRING_DOMAINS",
    description:
      "[ASYNC - Referring Domains] Get paginated list of unique domains that link to the target domain/URL. Returns domain name, domain rank, total backlinks from that domain, dofollow/nofollow counts, and first seen date. Use limit/offset for pagination (max 1000 per request). Takes 3-8 seconds. Cost: ~0.05 credits per request. Available in all plans.",
    inputSchema: referringDomainsInputSchema,
    outputSchema: referringDomainsOutputSchema,
    execute: async ({ context }) => {
      const client = getClientFromEnv(env);
      const result = await client.getReferringDomains(
        context.target,
        context.limit,
        context.offset,
      );
      return { data: result };
    },
  });

export const backlinkTools = [
  createBacklinksOverviewTool,
  createBacklinksTool,
  createReferringDomainsTool,
];
