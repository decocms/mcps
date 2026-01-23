import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { VTEXClient, getCredentials } from "../../lib/client.ts";
import type { Env } from "../../types/env.ts";

export const listOrders = (env: Env) =>
  createTool({
    id: "VTEX_LIST_ORDERS",
    description: "List orders with filters and pagination.",
    inputSchema: z.object({
      page: z.number().optional().describe("Page number (default: 1)"),
      perPage: z
        .number()
        .optional()
        .describe("Items per page (default: 15, max: 100)"),
      status: z
        .string()
        .optional()
        .describe(
          "Filter by status (e.g., 'ready-for-handling', 'invoiced', 'canceled')",
        ),
      creationDate: z
        .string()
        .optional()
        .describe(
          "Filter by creation date range (e.g., '[2024-01-01 TO 2024-12-31]')",
        ),
      q: z
        .string()
        .optional()
        .describe("Search query (order ID, client name, email)"),
    }),
    execute: async ({ context }) => {
      const client = new VTEXClient(getCredentials(env));
      return client.listOrders({
        page: context.page,
        per_page: context.perPage,
        f_status: context.status,
        f_creationDate: context.creationDate,
        q: context.q,
      });
    },
  });
