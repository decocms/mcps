/**
 * Admin tools for product variant images (api.fbits.net). They require the
 * `apiToken` configuration with permission for product images.
 *
 * Images are addressed by VARIANT id (`productVariantId` in the Storefront
 * API): with a product id the Admin API answers "Nenhuma imagem encontrada".
 */
import { z } from "zod";
import type { AdminClient } from "../lib/admin.ts";
import { createWakeAdminTool } from "../lib/tool.ts";

const BY_VARIANT = { tipoIdentificador: "ProdutoVarianteId" };
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

interface WakeImage {
  idImagem: number;
  nomeArquivo?: string;
  url?: string;
  ordem?: number;
  estampa?: boolean;
  exibirMiniatura?: boolean;
}

function toImage(image: WakeImage) {
  return {
    id: image.idImagem,
    fileName: image.nomeArquivo ?? null,
    url: image.url ?? null,
    order: image.ordem ?? null,
    isPrint: Boolean(image.estampa),
    showThumbnail: Boolean(image.exibirMiniatura),
  };
}

async function listVariantImages(
  client: AdminClient,
  variantId: number,
): Promise<WakeImage[]> {
  try {
    const data = await client.get<unknown>(
      `/produtos/${variantId}/imagens`,
      BY_VARIANT,
    );
    return Array.isArray(data) ? (data as WakeImage[]) : [];
  } catch (error) {
    // A variant without images answers 404 "Nenhuma imagem encontrada".
    if (error instanceof Error && /HTTP 404/.test(error.message)) return [];
    throw error;
  }
}

const variantIdSchema = z
  .number()
  .int()
  .positive()
  .describe(
    "Variant id (productVariantId from the Storefront API), not the product id",
  );

export const listVariantImagesTool = createWakeAdminTool({
  id: "WAKE_ADMIN_VARIANT_IMAGES_LIST",
  description:
    "List the images of one product variant (admin), with their id, URL, order and whether each is the print (estampa) image.",
  inputSchema: z.object({ variantId: variantIdSchema }),
  handler: async ({ variantId }, client) => {
    const images = (await listVariantImages(client, variantId)).map(toImage);
    return { images, count: images.length };
  },
});

async function imageFromUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("imageUrl must use https");
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`imageUrl answered ${res.status}`);
  const type = res.headers.get("content-type")?.split(";")[0] ?? "";
  const format = { "image/jpeg": "jpg", "image/png": "png" }[type];
  if (!format) throw new Error(`imageUrl must be a JPEG or PNG, got ${type}`);
  return {
    base64: Buffer.from(await res.arrayBuffer()).toString("base64"),
    format,
  };
}

export const addVariantImageTool = createWakeAdminTool({
  id: "WAKE_ADMIN_VARIANT_IMAGE_ADD",
  description:
    "Upload one image to a product variant (admin) at a given order. The image goes live on the store. Pass imageBase64 with format, or an https imageUrl (JPEG or PNG). Wake accepts up to 2 MB. Returns the new image with its id.",
  inputSchema: z.object({
    variantId: variantIdSchema,
    imageBase64: z
      .string()
      .optional()
      .describe("Image bytes in base64 (no data: prefix)"),
    format: z
      .enum(["jpg", "png"])
      .optional()
      .describe("Required with imageBase64"),
    imageUrl: z
      .string()
      .url()
      .optional()
      .describe("https URL to fetch the image from, instead of imageBase64"),
    order: z
      .number()
      .int()
      .min(0)
      .describe("Position of the image (ordem); lower comes first"),
    isPrint: z
      .boolean()
      .default(false)
      .describe("Mark as the print (estampa) image"),
    showThumbnail: z.boolean().default(true),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (input, client) => {
    let image: { base64: string; format: string };
    if (input.imageUrl) {
      image = await imageFromUrl(input.imageUrl);
    } else if (input.imageBase64 && input.format) {
      image = { base64: input.imageBase64, format: input.format };
    } else {
      throw new Error("Pass imageUrl, or imageBase64 with format");
    }
    if (Buffer.byteLength(image.base64, "base64") > MAX_IMAGE_BYTES) {
      throw new Error("The image is larger than 2 MB, the Wake limit");
    }

    const before = new Set(
      (await listVariantImages(client, input.variantId)).map((i) => i.idImagem),
    );
    await client.post(
      `/produtos/${input.variantId}/imagens`,
      [
        {
          base64: image.base64,
          formato: image.format,
          exibirMiniatura: input.showThumbnail,
          estampa: input.isPrint,
          ordem: input.order,
        },
      ],
      BY_VARIANT,
    );
    // The upload answers without the new id: find it by listing again.
    const added = (await listVariantImages(client, input.variantId))
      .filter((i) => !before.has(i.idImagem))
      .map(toImage);
    return { added };
  },
});

export const deleteVariantImageTool = createWakeAdminTool({
  id: "WAKE_ADMIN_VARIANT_IMAGE_DELETE",
  description:
    "Delete one image from a product variant (admin). The image disappears from the store; this cannot be undone.",
  inputSchema: z.object({
    variantId: variantIdSchema,
    imageId: z
      .number()
      .int()
      .positive()
      .describe("Image id from WAKE_ADMIN_VARIANT_IMAGES_LIST"),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async ({ variantId, imageId }, client) => {
    await client.delete(
      `/produtos/${variantId}/imagens/${imageId}`,
      BY_VARIANT,
    );
    return { deleted: imageId };
  },
});

export const imageTools = [
  listVariantImagesTool,
  addVariantImageTool,
  deleteVariantImageTool,
];
