import type { Env } from "../main";
import { createDataForSeoClient } from "../lib/dataforseo";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  backlinksOverviewInputSchema,
  backlinksOverviewOutputSchema,
  backlinksInputSchema,
  backlinksOutputSchema,
  referringDomainsInputSchema,
  referringDomainsOutputSchema,
} from "./schemas";

export const createBacklinksOverviewTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_BACKLINKS_OVERVIEW",
    description:
      "Get an overview of backlinks data for a domain. Returns total backlinks, referring domains, domain rank, and other key metrics.",
    inputSchema: backlinksOverviewInputSchema,
    outputSchema: backlinksOverviewOutputSchema,
    execute: async ({ context }) => {
      const state = env.DECO_REQUEST_CONTEXT.state;
      const client = createDataForSeoClient({
        login: state.login,
        password: state.password,
      });
      const result = await client.getBacklinksOverview(context.target);
      return { data: result };
    },
  });

export const createBacklinksTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_BACKLINKS",
    description:
      "Get a detailed list of backlinks for a domain or URL. Returns source URLs, anchor text, follow/nofollow status, and more.",
    inputSchema: backlinksInputSchema,
    outputSchema: backlinksOutputSchema,
    execute: async ({ context }) => {
      const state = env.DECO_REQUEST_CONTEXT.state;
      const client = createDataForSeoClient({
        login: state.login,
        password: state.password,
      });
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
      "Get list of domains linking to target. Returns domain ranks, number of backlinks per domain, and dofollow counts.",
    inputSchema: referringDomainsInputSchema,
    outputSchema: referringDomainsOutputSchema,
    execute: async ({ context }) => {
      const state = env.DECO_REQUEST_CONTEXT.state;
      const client = createDataForSeoClient({
        login: state.login,
        password: state.password,
      });
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
