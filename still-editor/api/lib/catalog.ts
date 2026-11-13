/**
 * Reads a garment from Wake through the store's Wake connection: the product
 * from its storefront link, every variant, and the main variant's images (the
 * current Still is the image at STILL_ORDER).
 */
import { callConnectionTool } from "./connection.ts";
import type { Env } from "../types/env.ts";

export type PieceType = "top" | "bottom";

export interface WakeImage {
  id: number;
  url: string | null;
  order: number | null;
  isPrint: boolean;
}

export interface Piece {
  productId: number;
  name: string;
  alias: string;
  type: PieceType | null;
  mainVariantId: number;
  /** Every variant, the main one included. */
  variantIds: number[];
  still: WakeImage | null;
  /** The model photos, in gallery order. */
  photos: string[];
}

/** The product id at the end of a storefront product link (`…-154267`). */
export function productIdFromLink(link: string): number | null {
  const trimmed = link.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  let path: string;
  try {
    path = new URL(trimmed).pathname;
  } catch {
    return null;
  }
  const match = path.replace(/\/+$/, "").match(/-(\d+)$/);
  return match ? Number(match[1]) : null;
}

interface ProductNode {
  productId: number;
  productVariantId: number;
  productName: string;
  alias: string;
  mainVariant: boolean;
  productCategories?: { id: number }[];
}

async function listVariants(
  env: Env,
  productId: number,
  mainVariant: boolean,
): Promise<ProductNode[]> {
  const result = (await callConnectionTool(env, "WAKE", "WAKE_LIST_PRODUCTS", {
    filters: { productId: [productId], mainVariant },
    first: 50,
  })) as { products?: { nodes?: ProductNode[] } };
  return result.products?.nodes ?? [];
}

export async function listVariantImages(
  env: Env,
  variantId: number,
): Promise<WakeImage[]> {
  const result = (await callConnectionTool(
    env,
    "WAKE",
    "WAKE_ADMIN_VARIANT_IMAGES_LIST",
    { variantId },
  )) as { images: WakeImage[] };
  return result.images;
}

export function stillOf(images: WakeImage[], stillOrder: number) {
  return (
    images.find((image) => image.order === stillOrder && !image.isPrint) ?? null
  );
}

export async function loadPiece(env: Env, productId: number): Promise<Piece> {
  const settings = env.MESH_REQUEST_CONTEXT.state;
  const [main, others] = await Promise.all([
    listVariants(env, productId, true),
    listVariants(env, productId, false),
  ]);
  const first = main[0];
  if (!first)
    throw new Error(`Product ${productId} was not found in the store`);
  const images = await listVariantImages(env, first.productVariantId);
  const categories = (first.productCategories ?? []).map((c) => Number(c.id));
  const type: PieceType | null = categories.some((id) =>
    settings.BOTTOM_CATEGORY_IDS.includes(id),
  )
    ? "bottom"
    : categories.some((id) => settings.TOP_CATEGORY_IDS.includes(id))
      ? "top"
      : null;
  return {
    productId,
    name: first.productName.trim(),
    alias: first.alias,
    type,
    mainVariantId: first.productVariantId,
    variantIds: [
      first.productVariantId,
      ...others
        .map((node) => node.productVariantId)
        .filter((id) => id !== first.productVariantId),
    ],
    still: stillOf(images, settings.STILL_ORDER),
    photos: images
      .filter(
        (image) =>
          !image.isPrint && image.order !== settings.STILL_ORDER && image.url,
      )
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((image) => image.url as string),
  };
}
