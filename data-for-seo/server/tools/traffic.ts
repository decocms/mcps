import type { Env } from "../main";
import { createDataForSeoClient } from "../lib/dataforseo";
import { createPrivateTool } from "@decocms/runtime/mastra";
import {
  trafficOverviewInputSchema,
  trafficOverviewOutputSchema,
  trafficBySourcesInputSchema,
  trafficBySourcesOutputSchema,
  trafficByCountryInputSchema,
  trafficByCountryOutputSchema,
  trafficByPagesInputSchema,
  trafficByPagesOutputSchema,
} from "./schemas";

export const createTrafficOverviewTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_TRAFFIC_OVERVIEW",
    description:
      "Get website traffic overview metrics. Returns visits, unique visitors, bounce rate, pages per visit, and average visit duration.",
    inputSchema: trafficOverviewInputSchema,
    outputSchema: trafficOverviewOutputSchema,
    execute: async ({ context }) => {
      const state = env.DECO_REQUEST_CONTEXT.state;
      const client = createDataForSeoClient({
        login: state.login,
        password: state.password,
      });
      const result = await client.getTrafficOverview(context.target);
      return { data: result };
    },
  });

export const createTrafficBySourcesTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_TRAFFIC_BY_SOURCES",
    description:
      "Get traffic breakdown by source. Returns distribution across direct, organic search, paid search, referral, social, mail, and display ads.",
    inputSchema: trafficBySourcesInputSchema,
    outputSchema: trafficBySourcesOutputSchema,
    execute: async ({ context }) => {
      const state = env.DECO_REQUEST_CONTEXT.state;
      const client = createDataForSeoClient({
        login: state.login,
        password: state.password,
      });
      const result = await client.getTrafficBySources(context.target);
      return { data: result };
    },
  });

export const createTrafficByCountryTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_TRAFFIC_BY_COUNTRY",
    description:
      "Get traffic distribution by country. Returns visits and percentage per country.",
    inputSchema: trafficByCountryInputSchema,
    outputSchema: trafficByCountryOutputSchema,
    execute: async ({ context }) => {
      const state = env.DECO_REQUEST_CONTEXT.state;
      const client = createDataForSeoClient({
        login: state.login,
        password: state.password,
      });
      const result = await client.getTrafficByCountry(
        context.target,
        context.limit,
        context.offset,
      );
      return { data: result };
    },
  });

export const createTrafficByPagesTool = (env: Env) =>
  createPrivateTool({
    id: "DATAFORSEO_GET_TRAFFIC_BY_PAGES",
    description:
      "Get traffic metrics for individual pages. Returns page views, unique visitors, bounce rate, and average time on page.",
    inputSchema: trafficByPagesInputSchema,
    outputSchema: trafficByPagesOutputSchema,
    execute: async ({ context }) => {
      const state = env.DECO_REQUEST_CONTEXT.state;
      const client = createDataForSeoClient({
        login: state.login,
        password: state.password,
      });
      const result = await client.getTrafficByPages(
        context.target,
        context.limit,
        context.offset,
      );
      return { data: result };
    },
  });

export const trafficTools = [
  createTrafficOverviewTool,
  createTrafficBySourcesTool,
  createTrafficByCountryTool,
  createTrafficByPagesTool,
];
