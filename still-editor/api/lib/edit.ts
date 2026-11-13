/**
 * One edit of a garment's Still: the model edits a plain-background image of
 * the garment, and the result is composed on the brand's plate at the same
 * garment width as the current Still.
 */
import type { User } from "@decocms/runtime";
import { listVariantImages, type Piece, stillOf } from "./catalog.ts";
import { callConnectionTool } from "./connection.ts";
import {
  borderColor,
  type Box,
  checkStill,
  composeAtWidth,
  compose,
  crop,
  decodeImage,
  encodeStill,
  fitScale,
  pieceBox,
  type Pixels,
  splitRow,
  type StillCheck,
  stillBox,
} from "./image.ts";
import type { Storage } from "./storage.ts";
import { type Env, settings } from "../types/env.ts";

export type Background = "white" | "grey";

/** The garment's original generation, seeded into storage. */
export interface PieceSource {
  /** Path of the generation image (both garments) under the prefix. */
  raw: string;
  /** Which garment of the generation this piece is. */
  half: "upper" | "lower";
  background: Background;
  /** Product facts: color, fabric, shape, hardware. */
  facts?: Record<string, string>;
  /** The other garment generated with this one. */
  pairProductId?: number;
}

export interface Version {
  id: string;
  productId: number;
  /** The version this one edited; null = the original Still. */
  parentId: string | null;
  prompt: string;
  model: string;
  background: Background;
  /** Garment width (px) the version was composed at: the current Still's. */
  targetWidth: number | null;
  check: StillCheck;
  author: { id: string; email: string; name: string | null };
  createdAt: string;
}

const BACKGROUND_LINE: Record<Background, string> = {
  white: "Pure white seamless background (#FFFFFF).",
  grey: "Plain medium-light neutral grey seamless studio background (#A8A8A8), evenly lit, the same grey everywhere.",
};

const PIECE_WORDS = { top: "swim top", bottom: "swim briefs" } as const;

const PROMPT = `You are a professional e-commerce product photographer and retoucher specialized in swimwear.

REFERENCES
- Reference image 1: the current product photo of this {{piece}} on its own, FRONT view. This is the image to edit.
- Reference images 2 and later: the real {{piece}} worn by a model. Use them only to check the real garment, never copy the person.

TASK
Edit reference image 1. Apply ONLY the change requested below and keep everything else exactly as it is: the cut and coverage, proportions, fabric texture, print scale and direction, color, hardware, the FRONT view and the framing. The result is ONE {{piece}} alone, whole, symmetric and centered.

REQUESTED CHANGE
{{request}}

PRODUCT FACTS
{{facts}}

PHOTO REQUIREMENTS
- Show only the garment. No model, no body, no skin, no hair, no mannequin, no hanger, no props, no text.
- Invisible/ghost mannequin style, FRONT view.
- Lighting: broad, diffuse, soft light; very soft, low-intensity shadows. Slightly warm, without changing the fabric color.
- Background: {{background}}
- Light retouching only: keep the real fabric texture and small natural folds. Photorealistic, sharp focus, e-commerce catalog quality.`;

export function buildPrompt(args: {
  piece: keyof typeof PIECE_WORDS | null;
  request: string;
  facts?: Record<string, string>;
  background: Background;
}): string {
  const facts = Object.entries(args.facts ?? {})
    .filter(([, value]) => value?.trim())
    .map(([name, value]) => `- ${name.toUpperCase()}: ${value.trim()}`);
  return PROMPT.replaceAll("{{piece}}", PIECE_WORDS[args.piece ?? "top"])
    .replace("{{request}}", args.request.trim())
    .replace(
      "{{facts}}",
      facts.length
        ? facts.join("\n")
        : "- (none given: follow the references exactly)",
    )
    .replace("{{background}}", BACKGROUND_LINE[args.background]);
}

const isRefusal = (message: string) =>
  /moderation|safety|refus|content filter|no image/i.test(message);

const luminance = (data: Uint8ClampedArray, i: number) =>
  0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

/**
 * A garment that is almost all one light color (off-white, cream) cannot be
 * separated from a white background, so it is generated on grey.
 */
export function isLightGarment(still: Pixels, plate: Pixels): boolean {
  let garment = 0;
  let light = 0;
  for (let i = 0; i < still.data.length; i += 4 * 3) {
    const away = Math.max(
      Math.abs(still.data[i] - plate.data[i]),
      Math.abs(still.data[i + 1] - plate.data[i + 1]),
      Math.abs(still.data[i + 2] - plate.data[i + 2]),
    );
    if (away < 24) continue;
    garment++;
    const chroma =
      Math.max(still.data[i], still.data[i + 1], still.data[i + 2]) -
      Math.min(still.data[i], still.data[i + 1], still.data[i + 2]);
    if (luminance(still.data, i) > 195 && chroma < 60) light++;
  }
  return garment > 0 && light / garment > 0.75;
}

const boxWidth = (box: Box | null) => (box ? box.x1 - box.x0 + 1 : null);

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Image download answered ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The garment of a two-garment generation. */
export async function sourceHalf(
  store: Storage,
  source: PieceSource,
): Promise<Pixels> {
  const bytes = await store.get(source.raw);
  if (!bytes) throw new Error(`Missing generation ${source.raw} in storage`);
  const raw = await decodeImage(bytes);
  const cut = splitRow(raw, borderColor(raw));
  if (cut === null) throw new Error("The original generation cannot be split");
  return source.half === "upper"
    ? crop(raw, 0, 0, raw.width, cut)
    : crop(raw, 0, cut, raw.width, raw.height - cut);
}

export async function loadPlate(store: Storage): Promise<Pixels> {
  const bytes = await store.get("assets/plate.png");
  if (!bytes) {
    throw new Error(
      "The backdrop plate is missing: upload it to <prefix>/assets/plate.png",
    );
  }
  return decodeImage(bytes);
}

export async function runEdit(args: {
  env: Env;
  store: Storage;
  piece: Piece;
  versionId: string;
  parentId: string | null;
  request: string;
  model: string;
  user: User;
}): Promise<Version> {
  const { env, store, piece, versionId, parentId } = args;
  const base = `pieces/${piece.productId}`;
  const plate = await loadPlate(store);
  const source = await store.getJson<PieceSource>(`${base}/source.json`);

  // The current Still sets the garment width the edit is composed at.
  const images = await listVariantImages(env, piece.mainVariantId);
  const current = stillOf(images, settings(env).STILL_ORDER);
  const currentPixels = current?.url
    ? await decodeImage(await fetchBytes(current.url))
    : null;
  const targetWidth = currentPixels
    ? boxWidth(stillBox(currentPixels, plate))
    : null;

  // The image the model edits: the previous version's model output, the
  // original generation, or (no generation stored) the live Still.
  let background: Background;
  let editUrl: string;
  if (parentId) {
    const parent = await store.getJson<Version>(
      `${base}/versions/${parentId}.json`,
    );
    if (!parent) throw new Error(`Version ${parentId} was not found`);
    background = parent.background;
    editUrl = await store.getUrl(`${base}/versions/${parentId}-model`);
  } else if (source) {
    background = source.background;
    const half = await sourceHalf(store, source);
    await store.put(
      `${base}/versions/${versionId}-base.jpg`,
      await encodeStill(half),
      "image/jpeg",
    );
    editUrl = await store.getUrl(`${base}/versions/${versionId}-base.jpg`);
  } else if (current?.url && currentPixels) {
    background = isLightGarment(currentPixels, plate) ? "grey" : "white";
    editUrl = current.url;
  } else {
    throw new Error("This product has no Still and no stored generation");
  }

  const prompt = buildPrompt({
    piece: piece.type,
    request: args.request,
    facts: source?.facts,
    background,
  });
  const isOpenAI = args.model.startsWith("openai/");
  const request = {
    model: args.model,
    prompt,
    referenceImages: [editUrl, ...piece.photos.slice(0, 2)].map((uri) => ({
      uri,
    })),
    ...(isOpenAI
      ? { size: "1536x1920", quality: "high", moderation: "low" }
      : { aspectRatio: "4:5" }),
  };
  let generated: {
    model: string;
    images: { uri: string; mediaType: string }[];
  };
  for (let attempt = 0; ; attempt++) {
    try {
      // Image models take up to ~80 s, past the binding's 60 s default.
      generated = (await callConnectionTool(
        env,
        "SELF",
        "generate_image",
        request,
        280_000,
      )) as typeof generated;
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= 1 || !isRefusal(message)) throw error;
    }
  }
  // A Studio without model choice ignores `model` and runs the tier's.
  if (generated.model !== args.model) {
    throw new Error(
      `Studio ran ${generated.model} instead of ${args.model}: it does not support choosing the image model yet`,
    );
  }
  const output = generated.images[0];
  if (!output) throw new Error("The image model returned no image");
  await keepGenerated(
    env,
    store,
    output,
    `${base}/versions/${versionId}-model`,
  );

  const still = await composeVersion(store, plate, {
    productId: piece.productId,
    id: versionId,
    targetWidth,
  });
  await store.put(
    `${base}/versions/${versionId}.jpg`,
    await encodeStill(still),
    "image/jpeg",
  );
  const version: Version = {
    id: versionId,
    productId: piece.productId,
    parentId,
    prompt: args.request.trim(),
    model: args.model,
    background,
    targetWidth,
    check: checkStill(still),
    author: {
      id: args.user.id,
      email: args.user.email,
      name: args.user.user_metadata?.full_name ?? null,
    },
    createdAt: new Date().toISOString(),
  };
  await store.putJson(`${base}/versions/${versionId}.json`, version);
  return version;
}

/**
 * Studio stores what generate_image returns in its own storage; the version
 * keeps a copy next to its other files and Studio's is removed.
 */
async function keepGenerated(
  env: Env,
  store: Storage,
  image: { uri: string; mediaType: string },
  path: string,
): Promise<void> {
  const key = image.uri.replace(/^studio-storage:\/\//, "");
  const { url } = (await callConnectionTool(env, "SELF", "GET_PRESIGNED_URL", {
    key,
    expiresIn: 300,
  })) as { url: string };
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Reading the generated image: HTTP ${res.status}`);
  await store.put(
    path,
    new Uint8Array(await res.arrayBuffer()),
    image.mediaType,
  );
  await callConnectionTool(env, "SELF", "DELETE_OBJECT", { key });
}

/**
 * The version's Still: its model output on the plate at the target garment
 * width, times `sizeFactor` (the size control in the editor).
 */
export async function composeVersion(
  store: Storage,
  plate: Pixels,
  version: Pick<Version, "productId" | "id" | "targetWidth">,
  sizeFactor = 1,
): Promise<Pixels> {
  const output = await store.get(
    `pieces/${version.productId}/versions/${version.id}-model`,
  );
  if (!output) throw new Error("The model output was not stored");
  const edited = await decodeImage(output);
  const bg = borderColor(edited);
  if (version.targetWidth) {
    return composeAtWidth(edited, bg, plate, version.targetWidth, sizeFactor);
  }
  const box = pieceBox(edited, bg);
  if (!box) throw new Error("No garment found in the generated image");
  return compose(edited, bg, plate, fitScale(box) * sizeFactor);
}
