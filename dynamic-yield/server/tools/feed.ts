import { z } from "zod";
import { dyFetch } from "../lib/client.ts";
import { createDyTool } from "../lib/tool.ts";

const feedId = z
  .string()
  .regex(/^\d+$/)
  .describe(
    "Numeric product feed id (Assets › Data Feeds, source Sync via API).",
  );

export const FeedBulkInputSchema = z.object({
  feedId,
  requests: z
    .array(
      z
        .object({
          id: z.string().min(1).describe("Product SKU."),
          action: z
            .enum(["update", "partial", "delete"])
            .describe(
              "update: full upsert. partial: change only the sent fields. delete: remove the SKU.",
            ),
          data: z
            .record(z.string(), z.unknown())
            .optional()
            .describe(
              "Feed row: sku, group_id, name, url, price, in_stock, image_url, categories (pipe-delimited), plus custom columns. Omit for delete.",
            ),
        })
        .refine((r) => r.action === "delete" || r.data !== undefined, {
          message: "data is required for update and partial",
        }),
    )
    .min(1)
    .max(100)
    .describe("Up to 100 actions per call (DY limit)."),
});

export const feedBulkTool = createDyTool({
  id: "DY_FEED_BULK",
  description:
    "Upsert, partially update or delete products in a Dynamic Yield API-synced product feed. Returns a transaction_id; check it with DY_FEED_TRANSACTION_STATUS. Changes apply to the live catalog used by recommendations. The API key needs the Feed ACL.",
  inputSchema: FeedBulkInputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  },
  handler: ({ feedId, requests }, env) =>
    dyFetch(env, `/feeds/${feedId}/bulk`, {
      body: {
        requests: requests.map(({ id, action, data }) => ({
          id,
          action,
          ...(data && { body: { data } }),
        })),
      },
    }),
});

export const feedTransactionStatusTool = createDyTool({
  id: "DY_FEED_TRANSACTION_STATUS",
  description:
    "Get the per-item status (success or failed) of a DY_FEED_BULK transaction, optionally for a single SKU. Items should settle within about 90 seconds.",
  inputSchema: z.object({
    feedId,
    transactionId: z.string().min(1),
    itemId: z.string().optional().describe("Only this SKU."),
  }),
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: ({ feedId, transactionId, itemId }, env) =>
    dyFetch(
      env,
      `/feeds/${feedId}/transaction/${encodeURIComponent(transactionId)}${
        itemId ? `/item/${encodeURIComponent(itemId)}` : ""
      }`,
      { method: "GET" },
    ),
});

export const feedTools = [feedBulkTool, feedTransactionStatusTool];
