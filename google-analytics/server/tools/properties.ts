import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { GaClient } from "../lib/ga-client.ts";

export const getPropertyDetailsTool = (env: Env) =>
  createPrivateTool({
    id: "get-property-details",
    description: "Returns details about a property.",
    inputSchema: z.object({
      property: z.string().describe("The Google Analytics Property identifier e.g. 'properties/1234567'"),
    }),
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      
      try {
        const [response] = await client.adminClient.getProperty({
          name: args.property,
        });
        
        return { response };
      } catch (error: any) {
        throw new Error(`Failed to retrieve property details: ${error.message}`);
      }
    },
  });

export const getCustomDimensionsAndMetricsTool = (env: Env) =>
  createPrivateTool({
    id: "get-custom-dimensions-and-metrics",
    description: "Retrieves the custom dimensions and metrics for a specific property.",
    inputSchema: z.object({
      property: z.string().describe("The Google Analytics Property identifier e.g. 'properties/1234567'"),
    }),
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      
      try {
        const [dimensions] = await client.adminClient.listCustomDimensions({
           parent: args.property,
        });
        
        const [metrics] = await client.adminClient.listCustomMetrics({
           parent: args.property,
        });
        
        return {
           dimensions,
           metrics,
        };
      } catch (error: any) {
        throw new Error(`Failed to retrieve custom dimensions/metrics: ${error.message}`);
      }
    },
  });
