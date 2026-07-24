/**
 * Analytics tools (read-only): ShopifyQL queries.
 */
import { z } from "zod";
import { shopifyGraphql } from "../lib/client.ts";
import { createShopifyTool } from "../lib/tool.ts";

export const RUN_SHOPIFYQL_QUERY = `
query RunShopifyql($query: String!) {
  shopifyqlQuery(query: $query) {
    __typename
    tableData {
      columns { name dataType displayName }
      rowData
    }
    parseErrors { code message }
  }
}`;

export const runShopifyql = createShopifyTool({
  id: "SHOPIFY_RUN_SHOPIFYQL",
  description:
    'Run a ShopifyQL analytics query, e.g. "FROM sales SHOW total_sales BY month SINCE -3m". Requires the read_reports scope; availability varies by plan.',
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'ShopifyQL query, e.g. "FROM sales SHOW total_sales, net_sales BY day SINCE -30d ORDER BY day"',
      ),
  }),
  handler: async (input, creds) => {
    const data = await shopifyGraphql<{ shopifyqlQuery: unknown }>(
      creds,
      RUN_SHOPIFYQL_QUERY,
      { query: input.query },
      "SHOPIFY_RUN_SHOPIFYQL",
    );
    return { result: data.shopifyqlQuery };
  },
});

export const analyticsTools = [runShopifyql];
