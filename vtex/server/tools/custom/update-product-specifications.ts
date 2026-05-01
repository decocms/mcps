import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { resolveCredentials } from "../../lib/client-factory.ts";
import type { Env } from "../../types/env.ts";

const inputSchema = z.object({
  productId: z.coerce.number().int().positive().describe("Catalog product ID."),
  specifications: z
    .array(
      z.object({
        Id: z.coerce
          .number()
          .int()
          .positive()
          .describe(
            "FieldId of the specification (e.g. 109 for 'Descrição DECO'). Must already exist in the product's category — VTEX rejects unknown FieldIds. Specs never previously written are not returned by VTEX_GET_PRODUCT_SPECIFICATIONS, so the caller must know the FieldId.",
          ),
        Value: z
          .array(z.string())
          .describe("Values to write. For free-text specs, pass [text]."),
        Text: z
          .string()
          .optional()
          .describe(
            "Optional flat text version of the value; some VTEX clients require it.",
          ),
      }),
    )
    .describe(
      "Complete spec set to write. Replaces the entire collection of the product's specs — anything not included is removed. To patch, call VTEX_GET_PRODUCT_SPECIFICATIONS, merge, and pass the result here.",
    ),
});

const outputSchema = z.object({
  ok: z.literal(true),
  productId: z.number().int().positive(),
});

export const updateProductSpecifications = (env: Env) =>
  createTool({
    id: "VTEX_UPDATE_PRODUCT_SPECIFICATIONS",
    description:
      "Replace all specifications for a product. Pass the complete set — values not included are removed. Caller does GET → merge → POST for partial updates. Counterpart of VTEX_GET_PRODUCT_SPECIFICATIONS.",
    inputSchema,
    outputSchema,
    execute: async ({ context }) => {
      const credentials = resolveCredentials(env.MESH_REQUEST_CONTEXT.state);
      const url = `https://${credentials.accountName}.vtexcommercestable.com.br/api/catalog_system/pvt/products/${context.productId}/specification`;
      console.log("[VTEX] POST", url);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(credentials.appKey
            ? { "X-VTEX-API-AppKey": credentials.appKey }
            : {}),
          ...(credentials.appToken
            ? { "X-VTEX-API-AppToken": credentials.appToken }
            : {}),
        },
        body: JSON.stringify(context.specifications),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `VTEX update product specifications failed (${response.status}): ${body}`,
        );
      }

      return { ok: true as const, productId: context.productId };
    },
  });
