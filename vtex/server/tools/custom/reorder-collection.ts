import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { resolveCredentials } from "../../lib/client-factory.ts";
import type { Env } from "../../types/env.ts";

const collectionProductSchema = z.object({
  SkuId: z.number().int().nullable().optional(),
});

const collectionProductsResponseSchema = z.object({
  Page: z.number().int().optional(),
  TotalPage: z.number().int().optional(),
  Data: z.array(collectionProductSchema).optional(),
});

const skuIdsByProductResponseSchema = z.array(
  z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
);

export function normalizeSkuIdsInput(
  value: string | number[] | string[] | null | undefined,
): string | number[] | string[] | null | undefined {
  if (typeof value !== "string") {
    return value;
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

export function buildCollectionImportCsv(skuIds: number[]): string {
  const header = "SKU,PRODUCT,SKUREFID,PRODUCTREFID";
  const rows = skuIds.map((skuId) => `${skuId},,,`).join("\n");
  return rows.length > 0 ? `${header}\n${rows}` : `${header}\n`;
}

export function buildCollectionImportXlsLikeContent(skuIds: number[]): string {
  const header = "SKU\tPRODUCT\tSKUREFID\tPRODUCTREFID";
  const rows = skuIds.map((skuId) => `${skuId}\t\t\t`).join("\n");
  return rows.length > 0 ? `${header}\n${rows}` : `${header}\n`;
}

async function getAllCollectionSkuIds(params: {
  accountName: string;
  appKey?: string;
  appToken?: string;
  collectionId: number;
}): Promise<number[]> {
  const skuIds: number[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetch(
      `https://${params.accountName}.vtexcommercestable.com.br/api/catalog/pvt/collection/${params.collectionId}/products?page=${page}&pageSize=1000`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(params.appKey ? { "X-VTEX-API-AppKey": params.appKey } : {}),
          ...(params.appToken
            ? { "X-VTEX-API-AppToken": params.appToken }
            : {}),
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to list collection products: ${response.status} ${await response.text()}`,
      );
    }

    const responseJson: unknown = await response.json();
    const parsed = collectionProductsResponseSchema.parse(responseJson);
    totalPages = parsed.TotalPage ?? page;

    for (const item of parsed.Data ?? []) {
      if (typeof item.SkuId === "number") {
        skuIds.push(item.SkuId);
      }
    }
    page += 1;
  }

  return uniqueSkuIds(skuIds);
}

async function getSkuIdsByProductIds(params: {
  accountName: string;
  appKey?: string;
  appToken?: string;
  productIds: number[];
}): Promise<number[]> {
  const skuIds: number[] = [];

  for (const productId of params.productIds) {
    const response = await fetch(
      `https://${params.accountName}.vtexcommercestable.com.br/api/catalog_system/pvt/sku/stockkeepingunitByProductId/${productId}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(params.appKey ? { "X-VTEX-API-AppKey": params.appKey } : {}),
          ...(params.appToken
            ? { "X-VTEX-API-AppToken": params.appToken }
            : {}),
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to list SKUs for product ${productId}: ${response.status} ${await response.text()}`,
      );
    }

    const responseJson: unknown = await response.json();
    const parsed = skuIdsByProductResponseSchema.parse(responseJson);
    for (const skuId of parsed) {
      skuIds.push(typeof skuId === "number" ? skuId : Number(skuId));
    }
  }

  return skuIds;
}

async function uploadCollectionFile(params: {
  accountName: string;
  appKey?: string;
  appToken?: string;
  collectionId: number;
  skuIds: number[];
  mode: "importexclude" | "importinsert";
}): Promise<void> {
  const uploadAttempts: Array<{
    fileName: string;
    mimeType: string;
    content: string;
  }> = [
    {
      fileName: `${params.mode}.xls`,
      mimeType: "application/vnd.ms-excel",
      content: buildCollectionImportXlsLikeContent(params.skuIds),
    },
    {
      fileName: `${params.mode}.csv`,
      mimeType: "text/csv",
      content: buildCollectionImportCsv(params.skuIds),
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

    const response = await fetch(
      `https://${params.accountName}.vtexcommercestable.com.br/api/catalog/pvt/collection/${params.collectionId}/stockkeepingunit/${params.mode}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(params.appKey ? { "X-VTEX-API-AppKey": params.appKey } : {}),
          ...(params.appToken
            ? { "X-VTEX-API-AppToken": params.appToken }
            : {}),
        },
        body: formData,
      },
    );

    if (response.ok) {
      return;
    }

    lastErrorMessage = `Failed to upload ${params.mode} as ${attempt.fileName}: ${response.status} ${await response.text()}`;
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
      const credentials = resolveCredentials(env.MESH_REQUEST_CONTEXT.state);
      const directSkuIds = context.skuIds ?? [];
      const productIds = context.productIds ?? [];
      const resolvedSkuIdsFromProducts = await getSkuIdsByProductIds({
        accountName: credentials.accountName,
        appKey: credentials.appKey,
        appToken: credentials.appToken,
        productIds,
      });
      const targetSkuIds = uniqueSkuIds([
        ...directSkuIds,
        ...resolvedSkuIdsFromProducts,
      ]);
      const existingSkuIds = await getAllCollectionSkuIds({
        accountName: credentials.accountName,
        appKey: credentials.appKey,
        appToken: credentials.appToken,
        collectionId: context.collectionId,
      });

      let excludedSkuCount = 0;
      if (existingSkuIds.length > 0) {
        await uploadCollectionFile({
          accountName: credentials.accountName,
          appKey: credentials.appKey,
          appToken: credentials.appToken,
          collectionId: context.collectionId,
          skuIds: existingSkuIds,
          mode: "importexclude",
        });
        excludedSkuCount = existingSkuIds.length;
      }

      if (targetSkuIds.length > 0) {
        await uploadCollectionFile({
          accountName: credentials.accountName,
          appKey: credentials.appKey,
          appToken: credentials.appToken,
          collectionId: context.collectionId,
          skuIds: targetSkuIds,
          mode: "importinsert",
        });
      }

      return {
        collectionId: context.collectionId,
        existingSkuCount: existingSkuIds.length,
        excludedSkuCount,
        insertedSkuCount: targetSkuIds.length,
        skippedExclude: existingSkuIds.length === 0,
      };
    },
  });
