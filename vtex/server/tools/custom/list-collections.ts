import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../../types/env.ts";

const DEFAULT_PAGE_SIZE = 50;
// Safety cap so a misbehaving/huge catalog can't spin forever.
const MAX_PAGES = 100;

const outputSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  total: z.number(),
});

export interface CollectionSearchPage {
  items?: unknown;
  paging?: { total?: number };
}

/**
 * Page through the catalog collection search endpoint, accumulating every
 * collection. The fetcher is injected so the pagination logic can be tested
 * without a live VTEX account. Stops when a page comes back short (last page),
 * once the reported `paging.total` is reached, or at the MAX_PAGES safety cap.
 */
export async function collectAllCollections(
  fetchPage: (page: number, pageSize: number) => Promise<CollectionSearchPage>,
  pageSize: number,
): Promise<{ items: Record<string, unknown>[]; total: number }> {
  const items: Record<string, unknown>[] = [];
  let total = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchPage(page, pageSize);
    const pageItems = Array.isArray(data.items)
      ? (data.items as Record<string, unknown>[])
      : [];
    items.push(...pageItems);
    if (typeof data.paging?.total === "number") {
      total = data.paging.total;
    }

    if (pageItems.length < pageSize || items.length >= total) {
      break;
    }
  }

  return { items, total: total || items.length };
}

// Read per-request env from `runtimeContext` — see comment in
// lib/tool-adapter.ts for why the factory's captured env is unsafe to read
// inside execute (cached registrations + fresh per-request bindings).
export const listCollections = (_env: Env) =>
  createTool({
    id: "VTEX_LIST_COLLECTIONS",
    description:
      "List all collections in the catalog (active and inactive), paginating through VTEX's collection search endpoint. Use VTEX_SEARCH_COLLECTIONS to filter by name, or VTEX_GET_COLLECTION to read one by ID.",
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(DEFAULT_PAGE_SIZE)
        .describe("Collections fetched per request while paginating (max 50)"),
    }),
    outputSchema,
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const { accountName, appKey, appToken } = env.MESH_REQUEST_CONTEXT.state;
      const pageSize = context.pageSize ?? DEFAULT_PAGE_SIZE;

      const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(appKey && { "X-VTEX-API-AppKey": appKey }),
        ...(appToken && { "X-VTEX-API-AppToken": appToken }),
      };

      // The search endpoint returns every collection when the search term is
      // blank; page through it until we've collected them all.
      return collectAllCollections(async (page, size) => {
        const url = `https://${accountName}.vtexcommercestable.com.br/api/catalog_system/pvt/collection/search/?page=${page}&pageSize=${size}`;
        console.log("[VTEX] GET", url);

        const response = await fetch(url, { headers });

        if (!response.ok) {
          throw new Error(
            `VTEX API Error: ${response.status} - ${await response.text()}`,
          );
        }

        return (await response.json()) as CollectionSearchPage;
      }, pageSize);
    },
  });
