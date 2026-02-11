/**
 * Property Management Tools
 *
 * Tools for listing and managing Google Analytics properties
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { AnalyticsClient, getAccessToken } from "../lib/analytics-client.ts";

// ============================================================================
// List Properties Tool
// ============================================================================

export const createListPropertiesTool = (env: Env) =>
  createPrivateTool({
    id: "ga_list_properties",
    description:
      "List all Google Analytics properties the authenticated user has access to. Returns property IDs, names, and configuration details.",
    inputSchema: z.object({
      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe(
          "Maximum number of properties to return (default: 50, max: 200)",
        ),
      pageToken: z
        .string()
        .optional()
        .describe("Token for pagination (from previous response)"),
      showDeleted: z
        .boolean()
        .optional()
        .describe("Include deleted properties (default: false)"),
    }),
    outputSchema: z.object({
      properties: z
        .array(
          z.object({
            name: z
              .string()
              .describe("Property resource name (e.g., properties/123456789)"),
            displayName: z.string().describe("User-friendly property name"),
            propertyId: z
              .string()
              .describe("Numeric property ID (extract from name)"),
            timeZone: z.string().describe("Property timezone"),
            currencyCode: z.string().describe("Currency code (e.g., USD, EUR)"),
            industryCategory: z
              .string()
              .optional()
              .describe("Industry category"),
            createTime: z
              .string()
              .optional()
              .describe("When the property was created"),
          }),
        )
        .describe("List of Google Analytics properties"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching the next page"),
      totalProperties: z.number().describe("Number of properties returned"),
    }),
    execute: async ({ context }) => {
      const client = new AnalyticsClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.listProperties({
        pageSize: context.pageSize || 50,
        pageToken: context.pageToken,
        showDeleted: context.showDeleted,
      });

      const properties = (result.properties || []).map((prop) => {
        // Extract numeric ID from resource name (e.g., "properties/123456789" -> "123456789")
        const propertyId = prop.name.split("/").pop() || "";

        return {
          name: prop.name,
          displayName: prop.displayName,
          propertyId,
          timeZone: prop.timeZone,
          currencyCode: prop.currencyCode,
          industryCategory: prop.industryCategory,
          createTime: prop.createTime,
        };
      });

      return {
        properties,
        nextPageToken: result.nextPageToken,
        totalProperties: properties.length,
      };
    },
  });

// ============================================================================
// Get Property Tool
// ============================================================================

export const createGetPropertyTool = (env: Env) =>
  createPrivateTool({
    id: "ga_get_property",
    description:
      "Get detailed information about a specific Google Analytics property including configuration, timezone, and currency settings.",
    inputSchema: z.object({
      propertyId: z
        .string()
        .describe(
          "Property ID (numeric ID or full resource name like 'properties/123456789')",
        ),
    }),
    outputSchema: z.object({
      property: z.object({
        name: z.string().describe("Property resource name"),
        displayName: z.string().describe("User-friendly property name"),
        propertyId: z.string().describe("Numeric property ID"),
        timeZone: z.string().describe("Property timezone"),
        currencyCode: z.string().describe("Currency code"),
        industryCategory: z.string().optional().describe("Industry category"),
        createTime: z.string().optional().describe("Creation timestamp"),
        updateTime: z.string().optional().describe("Last update timestamp"),
        parent: z.string().optional().describe("Parent account"),
      }),
    }),
    execute: async ({ context }) => {
      const client = new AnalyticsClient({
        accessToken: getAccessToken(env),
      });

      // Ensure property ID is in the correct format
      const propertyId = context.propertyId.startsWith("properties/")
        ? context.propertyId
        : `properties/${context.propertyId}`;

      const prop = await client.getProperty(propertyId);

      // Extract numeric ID
      const numericId = prop.name.split("/").pop() || "";

      return {
        property: {
          name: prop.name,
          displayName: prop.displayName,
          propertyId: numericId,
          timeZone: prop.timeZone,
          currencyCode: prop.currencyCode,
          industryCategory: prop.industryCategory,
          createTime: prop.createTime,
          updateTime: prop.updateTime,
          parent: prop.parent,
        },
      };
    },
  });

// ============================================================================
// List Data Streams Tool
// ============================================================================

export const createListDataStreamsTool = (env: Env) =>
  createPrivateTool({
    id: "ga_list_data_streams",
    description:
      "List all data streams (websites, apps) for a Google Analytics property. Data streams are the sources that send data to your GA4 property.",
    inputSchema: z.object({
      propertyId: z
        .string()
        .describe("Property ID (numeric ID or full resource name)"),
      pageSize: z.coerce
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum number of data streams to return (default: 50)"),
      pageToken: z.string().optional().describe("Token for pagination"),
    }),
    outputSchema: z.object({
      dataStreams: z
        .array(
          z.object({
            name: z.string().describe("Data stream resource name"),
            streamId: z.string().describe("Numeric stream ID"),
            type: z
              .enum([
                "WEB_DATA_STREAM",
                "ANDROID_APP_DATA_STREAM",
                "IOS_APP_DATA_STREAM",
              ])
              .describe("Type of data stream"),
            displayName: z.string().describe("User-friendly name"),
            measurementId: z
              .string()
              .optional()
              .describe("Measurement ID (for web streams)"),
            defaultUri: z.string().optional().describe("Default website URL"),
            packageName: z.string().optional().describe("Android package name"),
            bundleId: z.string().optional().describe("iOS bundle ID"),
            createTime: z.string().optional().describe("Creation timestamp"),
          }),
        )
        .describe("List of data streams"),
      nextPageToken: z.string().optional().describe("Token for next page"),
      totalStreams: z.number().describe("Number of streams returned"),
    }),
    execute: async ({ context }) => {
      const client = new AnalyticsClient({
        accessToken: getAccessToken(env),
      });

      // Ensure property ID is in the correct format
      const propertyId = context.propertyId.startsWith("properties/")
        ? context.propertyId
        : `properties/${context.propertyId}`;

      const result = await client.listDataStreams({
        propertyId,
        pageSize: context.pageSize || 50,
        pageToken: context.pageToken,
      });

      const dataStreams = (result.dataStreams || []).map((stream) => {
        // Extract numeric ID from resource name
        const streamId = stream.name.split("/").pop() || "";

        return {
          name: stream.name,
          streamId,
          type: stream.type,
          displayName: stream.displayName,
          measurementId: stream.webStreamData?.measurementId,
          defaultUri: stream.webStreamData?.defaultUri,
          packageName: stream.androidAppStreamData?.packageName,
          bundleId: stream.iosAppStreamData?.bundleId,
          createTime: stream.createTime,
        };
      });

      return {
        dataStreams,
        nextPageToken: result.nextPageToken,
        totalStreams: dataStreams.length,
      };
    },
  });

// ============================================================================
// Export all property tools
// ============================================================================

export const propertyTools = [
  createListPropertiesTool,
  createGetPropertyTool,
  createListDataStreamsTool,
];
