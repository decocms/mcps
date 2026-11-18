/**
 * Reads a garment from Wake through the store's Wake connection: the product
 * from its storefront link, every variant, and the main variant's images (the
 * current Still is the image at STILL_ORDER).
 */
import { callConnectionTool } from "./connection.ts";
import { type Env, settings } from "../types/env.ts";

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
  /** The Cor attribute (the print/color name), trimmed. */
  color: string | null;
  /** SKU prefix of the pair the model wears in the photos (LookComplementar). */
  lookComplementar: string | null;
  mainVariantId: number;
  /** Every variant, the main one included. */
  variantIds: number[];
  still: WakeImage | null;
  /** Every image of the main variant, in Wake's order. */
  images: WakeImage[];
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
  sku?: string;
  mainVariant: boolean;
  productCategories?: { id: number }[];
  attributes?: { name: string; value: string | null }[];
}

const attribute = (node: ProductNode, name: string): string | null =>
  node.attributes?.find((a) => a.name === name)?.value?.trim() || null;

function typeOf(env: Env, node: ProductNode): PieceType | null {
  const { TOP_CATEGORY_IDS, BOTTOM_CATEGORY_IDS } = settings(env);
  const categories = (node.productCategories ?? []).map((c) => Number(c.id));
  if (categories.some((id) => BOTTOM_CATEGORY_IDS.includes(id))) {
    return "bottom";
  }
  return categories.some((id) => TOP_CATEGORY_IDS.includes(id)) ? "top" : null;
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
  return result.images.map((image) => ({
    ...image,
    url: image.url && originalSize(image.url),
  }));
}

/**
 * Wake lists images resized to 800×800, letterboxing a 4×5 Still. Without
 * the size parameters it serves the original, which the edit measures and
 * the publication backs up.
 */
function originalSize(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete("w");
  parsed.searchParams.delete("h");
  return parsed.toString();
}

export function stillOf(images: WakeImage[], stillOrder: number) {
  return (
    images.find((image) => image.order === stillOrder && !image.isPrint) ?? null
  );
}

export async function loadPiece(env: Env, productId: number): Promise<Piece> {
  const { STILL_ORDER } = settings(env);
  const [main, others] = await Promise.all([
    listVariants(env, productId, true),
    listVariants(env, productId, false),
  ]);
  const first = main[0];
  if (!first)
    throw new Error(`Product ${productId} was not found in the store`);
  const images = await listVariantImages(env, first.productVariantId);
  return {
    productId,
    name: first.productName.trim(),
    alias: first.alias,
    type: typeOf(env, first),
    color: attribute(first, "Cor"),
    lookComplementar: attribute(first, "LookComplementar"),
    mainVariantId: first.productVariantId,
    variantIds: [
      first.productVariantId,
      ...others
        .map((node) => node.productVariantId)
        .filter((id) => id !== first.productVariantId),
    ],
    still: stillOf(images, STILL_ORDER),
    images,
    photos: images
      .filter(
        (image) => !image.isPrint && image.order !== STILL_ORDER && image.url,
      )
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((image) => image.url as string),
  };
}

export interface PairCandidate {
  productId: number;
  name: string;
  /** The pair the model wears in the piece's photos (its Look complementar). */
  isLook: boolean;
}

/**
 * Garments of the other type in the same color, the piece's Look complementar
 * first. Wake's attribute filter misses pieces, so this searches the color
 * name and keeps the exact Cor matches.
 */
export async function findPairCandidates(
  env: Env,
  piece: Piece,
): Promise<PairCandidate[]> {
  if (!piece.color || !piece.type) return [];
  const result = (await callConnectionTool(env, "WAKE", "WAKE_LIST_PRODUCTS", {
    filters: { search: [piece.color], mainVariant: true, available: true },
    first: 50,
  })) as { products?: { nodes?: ProductNode[] } };
  const look = piece.lookComplementar;
  return (result.products?.nodes ?? [])
    .filter(
      (node) =>
        node.productId !== piece.productId &&
        attribute(node, "Cor") === piece.color &&
        typeOf(env, node) !== null &&
        typeOf(env, node) !== piece.type,
    )
    .map((node) => ({
      productId: node.productId,
      name: node.productName.trim(),
      isLook: Boolean(look && node.sku?.trim().startsWith(look)),
    }))
    .sort((a, b) => Number(b.isLook) - Number(a.isLook));
}
