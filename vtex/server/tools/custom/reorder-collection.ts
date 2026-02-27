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

const reorderCollectionInputSchema = z.object({
  collectionId: z
    .number()
    .int()
    .positive()
    .describe("Collection ID to overwrite."),
  skuIds: z
    .array(z.number().int().positive())
    .describe("Ordered SKU IDs that should remain in the collection."),
});

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

async function uploadCollectionXml(params: {
  accountName: string;
  appKey?: string;
  appToken?: string;
  collectionId: number;
  xmlContent: string;
  mode: "importexclude" | "importinsert";
}): Promise<void> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([params.xmlContent], { type: "application/xml" }),
    `${params.mode}.xml`,
  );

  const response = await fetch(
    `https://${params.accountName}.vtexcommercestable.com.br/api/catalog/pvt/collection/${params.collectionId}/stockkeepingunit/${params.mode}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(params.appKey ? { "X-VTEX-API-AppKey": params.appKey } : {}),
        ...(params.appToken ? { "X-VTEX-API-AppToken": params.appToken } : {}),
      },
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to upload ${params.mode}: ${response.status} ${await response.text()}`,
    );
  }
}

export const reorderCollection = (env: Env) =>
  createTool({
    id: "VTEX_REORDER_COLLECTION",
    description:
      "Overwrite collection contents by removing current SKUs and importing a new ordered SKU list via XML.",
    inputSchema: reorderCollectionInputSchema,
    outputSchema: reorderCollectionOutputSchema,
    execute: async ({ context }) => {
      const credentials = resolveCredentials(env.MESH_REQUEST_CONTEXT.state);
      const targetSkuIds = uniqueSkuIds(context.skuIds);
      const existingSkuIds = await getAllCollectionSkuIds({
        accountName: credentials.accountName,
        appKey: credentials.appKey,
        appToken: credentials.appToken,
        collectionId: context.collectionId,
      });

      let excludedSkuCount = 0;
      if (existingSkuIds.length > 0) {
        const excludeXml = buildCollectionImportXml(existingSkuIds);
        await uploadCollectionXml({
          accountName: credentials.accountName,
          appKey: credentials.appKey,
          appToken: credentials.appToken,
          collectionId: context.collectionId,
          xmlContent: excludeXml,
          mode: "importexclude",
        });
        excludedSkuCount = existingSkuIds.length;
      }

      if (targetSkuIds.length > 0) {
        const insertXml = buildCollectionImportXml(targetSkuIds);
        await uploadCollectionXml({
          accountName: credentials.accountName,
          appKey: credentials.appKey,
          appToken: credentials.appToken,
          collectionId: context.collectionId,
          xmlContent: insertXml,
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
