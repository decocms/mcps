/**
 * Account Management Tools
 *
 * Tools for listing and getting Google Ads customer accounts
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { GoogleAdsClient, getAccessToken } from "../lib/google-ads-client.ts";

// ============================================================================
// List Accessible Customers Tool
// ============================================================================

export const createListAccessibleCustomersTool = (env: Env) =>
  createPrivateTool({
    id: "list_accessible_customers",
    description:
      "List all Google Ads customer accounts accessible by the authenticated user. Returns customer resource names that can be used to get customer details.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      customers: z.array(
        z.object({
          resourceName: z
            .string()
            .describe("Customer resource name (e.g., 'customers/1234567890')"),
          customerId: z.string().describe("Extracted customer ID"),
        }),
      ),
      count: z.number().describe("Number of accessible customers"),
    }),
    execute: async () => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listAccessibleCustomers();

      const customers = (response.resourceNames || []).map((resourceName) => {
        // Extract customer ID from resource name (e.g., 'customers/1234567890' -> '1234567890')
        const customerId = resourceName.replace("customers/", "");
        return {
          resourceName,
          customerId,
        };
      });

      return {
        customers,
        count: customers.length,
      };
    },
  });

// ============================================================================
// Get Customer Tool
// ============================================================================

export const createGetCustomerTool = (env: Env) =>
  createPrivateTool({
    id: "get_customer",
    description:
      "Get detailed information about a specific Google Ads customer account including name, currency, timezone, and settings.",
    inputSchema: z.object({
      customerId: z
        .string()
        .describe(
          "Google Ads customer ID (e.g., '1234567890', without hyphens)",
        ),
    }),
    outputSchema: z.object({
      customer: z
        .object({
          resourceName: z.string(),
          id: z.string(),
          descriptiveName: z.string(),
          currencyCode: z.string(),
          timeZone: z.string(),
          trackingUrlTemplate: z.string().optional(),
          autoTaggingEnabled: z.boolean().optional(),
          manager: z.boolean().optional(),
          testAccount: z.boolean().optional(),
        })
        .nullable(),
    }),
    execute: async ({ context }) => {
      const client = new GoogleAdsClient({
        accessToken: getAccessToken(env),
      });

      const customer = await client.getCustomer(context.customerId);

      if (!customer) {
        return { customer: null };
      }

      return {
        customer: {
          resourceName: customer.resourceName,
          id: customer.id,
          descriptiveName: customer.descriptiveName,
          currencyCode: customer.currencyCode,
          timeZone: customer.timeZone,
          trackingUrlTemplate: customer.trackingUrlTemplate,
          autoTaggingEnabled: customer.autoTaggingEnabled,
          manager: customer.manager,
          testAccount: customer.testAccount,
        },
      };
    },
  });

// ============================================================================
// Export all account tools
// ============================================================================

export const accountTools = [
  createListAccessibleCustomersTool,
  createGetCustomerTool,
];
