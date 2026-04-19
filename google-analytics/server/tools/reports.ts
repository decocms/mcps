import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { GaClient } from "../lib/ga-client.ts";

const DateRangeSchema = z.object({
  startDate: z.string().describe("The inclusive start date in YYYY-MM-DD or 'today', 'yesterday', or 'NdaysAgo' format."),
  endDate: z.string().describe("The inclusive end date in YYYY-MM-DD format."),
});

const DimensionSchema = z.object({
  name: z.string(),
});

const MetricSchema = z.object({
  name: z.string(),
});

export const runReportTool = (env: Env) =>
  createPrivateTool({
    id: "run-report",
    description: "Runs a Google Analytics report using the Data API.",
    inputSchema: z.object({
      property: z.string().describe("The Google Analytics Property identifier e.g. 'properties/1234567'"),
      dateRanges: z.array(DateRangeSchema).min(1).describe("Date ranges to query."),
      dimensions: z.array(DimensionSchema).optional().describe("Dimensions requested and displayed."),
      metrics: z.array(MetricSchema).optional().describe("Metrics requested and displayed."),
      limit: z.number().optional().describe("Maximum number of rows to return."),
    }),
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      
      try {
        const [response] = await client.dataClient.runReport({
          property: args.property,
          dateRanges: args.dateRanges,
          dimensions: args.dimensions,
          metrics: args.metrics,
          limit: args.limit,
        });
        
        return { response };
      } catch (error: any) {
        throw new Error(`Failed to run report: ${error.message}`);
      }
    },
  });

export const runRealtimeReportTool = (env: Env) =>
  createPrivateTool({
    id: "run-realtime-report",
    description: "Runs a Google Analytics realtime report using the Data API.",
    inputSchema: z.object({
      property: z.string().describe("The Google Analytics Property identifier e.g. 'properties/1234567'"),
      dimensions: z.array(DimensionSchema).optional().describe("Dimensions requested and displayed."),
      metrics: z.array(MetricSchema).optional().describe("Metrics requested and displayed."),
      limit: z.number().optional().describe("Maximum number of rows to return."),
    }),
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      
      try {
        const [response] = await client.dataClient.runRealtimeReport({
          property: args.property,
          dimensions: args.dimensions,
          metrics: args.metrics,
          limit: args.limit,
        });
        
        return { response };
      } catch (error: any) {
        throw new Error(`Failed to run realtime report: ${error.message}`);
      }
    },
  });
