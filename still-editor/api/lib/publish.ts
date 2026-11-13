/**
 * Publishes a Still to every variant of a product in Wake, or restores the one
 * a publication replaced. The main variant (the one the storefront reads) goes
 * last, and a failure on any variant puts back what the publication changed.
 */
import type { User } from "@decocms/runtime";
import { listVariantImages, type Piece, stillOf } from "./catalog.ts";
import { callConnectionTool } from "./connection.ts";
import type { Storage } from "./storage.ts";
import { type Env, settings } from "../types/env.ts";

const LOCK_TTL_MS = 10 * 60 * 1000;

export interface VariantResult {
  variantId: number;
  added: number | null;
  removed: number[];
}

export interface Publication {
  id: string;
  productId: number;
  kind: "publish" | "restore";
  /** The version published (publish) or the publication undone (restore). */
  from: string;
  sizeFactor: number;
  /** The Still this publication replaced, kept to restore it. */
  before: { imageId: number; path: string } | null;
  imagePath: string;
  variants: VariantResult[];
  status: "published" | "rolled-back";
  error?: string;
  author: { id: string; email: string; name: string | null };
  at: string;
}

async function addImage(
  env: Env,
  variantId: number,
  imageUrl: string,
): Promise<number> {
  const result = (await callConnectionTool(
    env,
    "WAKE",
    "WAKE_ADMIN_VARIANT_IMAGE_ADD",
    {
      variantId,
      imageUrl,
      order: settings(env).STILL_ORDER,
      isPrint: false,
      showThumbnail: true,
    },
  )) as { added: { id: number }[] };
  const id = result.added[0]?.id;
  if (!id) throw new Error(`Wake did not return the new image of ${variantId}`);
  return id;
}

const deleteImage = (env: Env, variantId: number, imageId: number) =>
  callConnectionTool(env, "WAKE", "WAKE_ADMIN_VARIANT_IMAGE_DELETE", {
    variantId,
    imageId,
  });

/** Variants share the product's images folder, `…-<productId>/…`. */
export function belongsToProduct(
  urls: Array<string | null>,
  productId: number,
): boolean {
  return urls.every((url) => !url || url.includes(`-${productId}/`));
}

export async function publishStill(args: {
  env: Env;
  store: Storage;
  piece: Piece;
  /** Storage path of the JPEG to publish. */
  imagePath: string;
  /** The Still id the user saw when opening the piece (null = none). */
  expectedStillId: number | null;
  publicationId: string;
  kind: Publication["kind"];
  from: string;
  sizeFactor: number;
  user: User;
}): Promise<Publication> {
  const { env, store, piece } = args;
  const stillOrder = settings(env).STILL_ORDER;
  const base = `pieces/${piece.productId}`;
  const lockPath = `locks/${piece.productId}.json`;

  const lock = await store.getJson<{ at: string }>(lockPath);
  if (lock && Date.now() - Date.parse(lock.at) < LOCK_TTL_MS) {
    throw new Error(
      "Another publication of this product is in progress. Try again in a few minutes.",
    );
  }
  await store.putJson(lockPath, { at: new Date().toISOString() });

  try {
    const current = stillOf(
      await listVariantImages(env, piece.mainVariantId),
      stillOrder,
    );
    if ((current?.id ?? null) !== args.expectedStillId) {
      throw new Error(
        "The Still changed since this product was opened. Open it again to see the current one.",
      );
    }
    let before: Publication["before"] = null;
    if (current?.url) {
      const res = await fetch(current.url);
      if (!res.ok)
        throw new Error(`Backing up the Still answered ${res.status}`);
      const path = `${base}/publications/${args.publicationId}-before.jpg`;
      await store.put(
        path,
        new Uint8Array(await res.arrayBuffer()),
        "image/jpeg",
      );
      before = { imageId: current.id, path };
    }

    const imageUrl = await store.getUrl(args.imagePath);
    const order = [
      ...piece.variantIds.filter((id) => id !== piece.mainVariantId),
      piece.mainVariantId,
    ];
    const done: VariantResult[] = [];
    let failure: string | undefined;
    for (const variantId of order) {
      let added: number | null = null;
      try {
        const images = await listVariantImages(env, variantId);
        if (
          !belongsToProduct(
            images.map((image) => image.url),
            piece.productId,
          )
        ) {
          throw new Error(
            `Variant ${variantId} has images of another product; nothing was changed on it`,
          );
        }
        const old = images.filter(
          (image) => image.order === stillOrder && !image.isPrint,
        );
        added = await addImage(env, variantId, imageUrl);
        for (const image of old) await deleteImage(env, variantId, image.id);
        done.push({ variantId, added, removed: old.map((image) => image.id) });
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        if (added) await deleteImage(env, variantId, added).catch(() => {});
        break;
      }
    }

    if (failure) {
      const beforeUrl = before ? await store.getUrl(before.path) : null;
      for (const variant of done) {
        try {
          if (beforeUrl && variant.removed.length) {
            await addImage(env, variant.variantId, beforeUrl);
          }
          if (variant.added) {
            await deleteImage(env, variant.variantId, variant.added);
          }
        } catch (error) {
          console.error(`[still-editor] rollback ${variant.variantId}`, error);
        }
      }
    }

    const publication: Publication = {
      id: args.publicationId,
      productId: piece.productId,
      kind: args.kind,
      from: args.from,
      sizeFactor: args.sizeFactor,
      before,
      imagePath: args.imagePath,
      variants: done,
      status: failure ? "rolled-back" : "published",
      ...(failure ? { error: failure } : {}),
      author: {
        id: args.user.id,
        email: args.user.email,
        name: args.user.user_metadata?.full_name ?? null,
      },
      at: new Date().toISOString(),
    };
    await store.putJson(
      `${base}/publications/${args.publicationId}.json`,
      publication,
    );
    return publication;
  } finally {
    await store.remove(lockPath).catch(() => {});
  }
}
