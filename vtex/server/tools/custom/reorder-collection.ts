import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { resolveCredentials } from "../../lib/client-factory.ts";
import type { Env } from "../../types/env.ts";

/**
 * Keeps SSE connections alive during long-running operations by periodically
 * logging progress, preventing transport-level timeouts.
 */
async function withHeartbeat<T>(
  promise: Promise<T>,
  label: string,
  intervalMs = 12000,
): Promise<T> {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let elapsedSeconds = 0;

  try {
    heartbeatTimer = setInterval(() => {
      elapsedSeconds += intervalMs / 1000;
      console.log(
        `[${label}] Still processing... (${elapsedSeconds}s elapsed)`,
      );
    }, intervalMs);

    return await promise;
  } finally {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
    }
  }
}

export function normalizeSkuIdsInput(
  value: unknown,
): string | number[] | string[] | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value as number[] | string[];
  }

  if (typeof value === "number") {
    return [value];
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return [];
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as string[] | number[];
      }
    } catch {
      // Fall back to CSV parsing when JSON parsing fails.
    }
  }

  return trimmed
    .split(",")
    .map((skuId) => skuId.trim())
    .filter((skuId) => skuId.length > 0);
}

const reorderCollectionInputSchema = z
  .object({
    collectionId: z.coerce
      .number()
      .int()
      .positive()
      .describe("Collection ID to overwrite."),
    skuIds: z.preprocess(
      normalizeSkuIdsInput,
      z
        .array(z.coerce.number().int().positive())
        .optional()
        .describe("Ordered SKU IDs that should remain in the collection."),
    ),
    productIds: z.preprocess(
      normalizeSkuIdsInput,
      z
        .array(z.coerce.number().int().positive())
        .optional()
        .describe(
          "Ordered product IDs. Their SKUs are resolved and included in order.",
        ),
    ),
  })
  .refine(
    (data) =>
      (data.skuIds?.length ?? 0) > 0 || (data.productIds?.length ?? 0) > 0,
    {
      message: "Provide at least one of skuIds or productIds.",
      path: ["skuIds"],
    },
  );

const reorderCollectionOutputSchema = z.object({
  collectionId: z.number().int().positive(),
  existingSkuCount: z.number().int().nonnegative(),
  excludedSkuCount: z.number().int().nonnegative(),
  insertedSkuCount: z.number().int().nonnegative(),
  skippedExclude: z.boolean(),
});

function uniqueSkuIds(skuIds: number[]): number[] {
  return [...new Set(skuIds)];
}

export function buildCollectionImportXml(skuIds: number[]): string {
  const items = skuIds
    .map(
      (skuId) =>
        `<CollectionItemDTO><SkuId>${skuId}</SkuId></CollectionItemDTO>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><ArrayOfCollectionItemDTO>${items}</ArrayOfCollectionItemDTO>`;
}

export function buildCollectionImportCsv(
  ids: number[],
  column: "sku" | "product" = "sku",
): string {
  const header = "SKU,PRODUCT,SKUREFID,PRODUCTREFID";
  const rows = ids
    .map((id) => (column === "sku" ? `${id},,,` : `,${id},,`))
    .join("\n");
  return rows.length > 0 ? `${header}\n${rows}` : `${header}\n`;
}

export function buildCollectionImportXlsLikeContent(
  ids: number[],
  column: "sku" | "product" = "sku",
): string {
  const header = "SKU\tPRODUCT\tSKUREFID\tPRODUCTREFID";
  const rows = ids
    .map((id) => (column === "sku" ? `${id}\t\t\t` : `\t${id}\t\t`))
    .join("\n");
  return rows.length > 0 ? `${header}\n${rows}` : `${header}\n`;
}

const collectionProductSchema = z.object({
  ProductId: z.number().int().nullable().optional(),
});

const collectionProductsResponseSchema = z.object({
  Page: z.number().int().optional(),
  TotalPage: z.number().int().optional(),
  Data: z.array(collectionProductSchema).optional(),
});

async function getCollectionProductIds(params: {
  accountName: string;
  appKey?: string;
  appToken?: string;
  collectionId: number;
}): Promise<number[]> {
  const productIds: number[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const listUrl = `https://${params.accountName}.vtexcommercestable.com.br/api/catalog/pvt/collection/${params.collectionId}/products?page=${page}&pageSize=1000`;
    console.log("[VTEX] GET", listUrl);
    const response = await fetch(listUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(params.appKey ? { "X-VTEX-API-AppKey": params.appKey } : {}),
        ...(params.appToken ? { "X-VTEX-API-AppToken": params.appToken } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to list collection products: ${response.status} ${await response.text()}`,
      );
    }

    const responseJson: unknown = await response.json();
    const parsed = collectionProductsResponseSchema.parse(responseJson);
    totalPages = parsed.TotalPage ?? page;

    for (const item of parsed.Data ?? []) {
      if (typeof item.ProductId === "number") {
        productIds.push(item.ProductId);
      }
    }
    page += 1;
  }

  return [...new Set(productIds)];
}

async function uploadCollectionFile(params: {
  accountName: string;
  appKey?: string;
  appToken?: string;
  collectionId: number;
  ids: number[];
  column: "sku" | "product";
  mode: "importexclude" | "importinsert";
}): Promise<void> {
  const uploadAttempts: Array<{
    fileName: string;
    mimeType: string;
    content: string;
  }> = [
    {
      fileName: `${params.mode}.csv`,
      mimeType: "text/csv",
      content: buildCollectionImportCsv(params.ids, params.column),
    },
  ];

  let lastErrorMessage: string | null = null;
  for (const attempt of uploadAttempts) {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([attempt.content], { type: attempt.mimeType }),
      attempt.fileName,
    );

    const uploadUrl = `https://${params.accountName}.vtexcommercestable.com.br/api/catalog/pvt/collection/${params.collectionId}/stockkeepingunit/${params.mode}`;
    console.log(
      `[VTEX] POST ${uploadUrl} — mode=${params.mode} file=${attempt.fileName} rows=${params.ids.length}`,
    );
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(params.appKey ? { "X-VTEX-API-AppKey": params.appKey } : {}),
        ...(params.appToken ? { "X-VTEX-API-AppToken": params.appToken } : {}),
      },
      body: formData,
    });

    const responseText = await response.text();
    console.log(
      `[VTEX] Response for ${attempt.fileName}: status=${response.status} ok=${response.ok} body=${responseText}`,
    );

    if (response.ok) {
      return;
    }

    lastErrorMessage = `Failed to upload ${params.mode} as ${attempt.fileName}: ${response.status} ${responseText}`;
  }

  if (lastErrorMessage) {
    throw new Error(lastErrorMessage);
  }
}

export const reorderCollection = (env: Env) =>
  createTool({
    id: "VTEX_REORDER_COLLECTION",
    description:
      "Overwrite collection contents by removing current SKUs and importing a new ordered SKU list via spreadsheet file.",
    inputSchema: reorderCollectionInputSchema,
    outputSchema: reorderCollectionOutputSchema,
    execute: async ({ context }) => {
      const reorderPromise = (async () => {
        const credentials = resolveCredentials(env.MESH_REQUEST_CONTEXT.state);
        const directSkuIds = context.skuIds ?? [];
        const productIds = context.productIds ?? [];

        console.log(
          `[VTEX] Fetching existing products for collection ${context.collectionId}...`,
        );
        const existingProductIds = await getCollectionProductIds({
          accountName: credentials.accountName,
          appKey: credentials.appKey,
          appToken: credentials.appToken,
          collectionId: context.collectionId,
        });
        console.log(
          `[VTEX] Found ${existingProductIds.length} existing products.`,
        );

        let excludedSkuCount = 0;
        if (existingProductIds.length > 0) {
          console.log(
            `[VTEX] Deleting ${existingProductIds.length} products from collection ${context.collectionId}...`,
          );
          await uploadCollectionFile({
            accountName: credentials.accountName,
            appKey: credentials.appKey,
            appToken: credentials.appToken,
            collectionId: context.collectionId,
            ids: existingProductIds,
            column: "product",
            mode: "importexclude",
          });
          console.log(`[VTEX] Deletion done.`);
          excludedSkuCount = existingProductIds.length;
        } else {
          console.log(`[VTEX] Collection is empty, skipping deletion.`);
        }

        let insertedSkuCount = 0;
        if (directSkuIds.length > 0) {
          console.log(
            `[VTEX] Inserting ${uniqueSkuIds(directSkuIds).length} SKUs (by skuId) into collection ${context.collectionId}...`,
          );
          await uploadCollectionFile({
            accountName: credentials.accountName,
            appKey: credentials.appKey,
            appToken: credentials.appToken,
            collectionId: context.collectionId,
            ids: uniqueSkuIds(directSkuIds),
            column: "sku",
            mode: "importinsert",
          });
          insertedSkuCount += uniqueSkuIds(directSkuIds).length;
          console.log(`[VTEX] SKU insertion done.`);
        }
        if (productIds.length > 0) {
          console.log(
            `[VTEX] Inserting ${productIds.length} products (by productId) into collection ${context.collectionId}...`,
          );
          await uploadCollectionFile({
            accountName: credentials.accountName,
            appKey: credentials.appKey,
            appToken: credentials.appToken,
            collectionId: context.collectionId,
            ids: productIds,
            column: "product",
            mode: "importinsert",
          });
          insertedSkuCount += productIds.length;
          console.log(`[VTEX] Product insertion done.`);
        }

        return {
          collectionId: context.collectionId,
          existingSkuCount: existingProductIds.length,
          excludedSkuCount,
          insertedSkuCount,
          skippedExclude: existingProductIds.length === 0,
        };
      })();

      return withHeartbeat(reorderPromise, "VTEX_REORDER_COLLECTION");
    },
  });
