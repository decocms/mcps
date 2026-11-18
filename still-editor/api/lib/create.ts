/**
 * Creating a Still for a garment that has none, from its product photos, the
 * way the production batches made every Still: a vision model writes the
 * product facts, the image model paints the garment with its pair (top over
 * bottom, front view), the image is cut in two and the garment composed on the
 * plate at the scale of the pair's published Still, so the two keep their
 * proportion in Mix & Match.
 */
import type { User } from "@decocms/runtime";
import {
  listVariantImages,
  loadPiece,
  type Piece,
  type WakeImage,
} from "./catalog.ts";
import { callConnectionTool } from "./connection.ts";
import {
  type Background,
  generateImage,
  keepGenerated,
  loadPlate,
  type PieceSource,
  type Version,
} from "./edit.ts";
import {
  borderColor,
  checkStill,
  compose,
  crop,
  decodeImage,
  encodeStill,
  fitScale,
  isOnPlate,
  jpegSize,
  lightShare,
  pieceBox,
  type Pixels,
  scaleForWidth,
  splitRow,
  stillBox,
} from "./image.ts";
import type { JobPhase } from "./jobs.ts";
import { type Publication, publishStill } from "./publish.ts";
import type { Storage } from "./storage.ts";
import { type Env, settings } from "../types/env.ts";

/** Why a Still cannot be created for a piece. */
export type CreateBlock =
  | "has-still"
  | "still-moved"
  | "not-garment"
  | "no-model-photos";

/** A Still that left its order (the admin renumbers images on reorder). */
export interface MovedStill {
  imageId: number;
  order: number;
  url: string;
}

export function createBlock(
  piece: Piece,
  moved: MovedStill | null,
): CreateBlock | null {
  if (piece.still) return "has-still";
  if (moved) return "still-moved";
  if (!piece.type) return "not-garment";
  if (piece.photos.length === 0) return "no-model-photos";
  return null;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Image download answered ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function onPlateAt(
  image: WakeImage,
  plate: Pixels,
): Promise<MovedStill | null> {
  if (!image.url || image.isPrint) return null;
  try {
    const bytes = await fetchBytes(image.url);
    // Model photos are rarely the Still's size: skip decoding those.
    const size = jpegSize(bytes);
    if (size && (size.width !== plate.width || size.height !== plate.height)) {
      return null;
    }
    const pixels = await decodeImage(bytes);
    return isOnPlate(pixels, plate)
      ? { imageId: image.id, order: image.order ?? 0, url: image.url }
      : null;
  } catch {
    return null;
  }
}

/** A Still among the gallery images, outside the Still's order. */
export async function findMovedStill(
  env: Env,
  piece: Piece,
  plate: Pixels,
): Promise<MovedStill | null> {
  const { STILL_ORDER } = settings(env);
  const found = await Promise.all(
    piece.images
      .filter((image) => image.order !== STILL_ORDER)
      .map((image) => onPlateAt(image, plate)),
  );
  return found.find((still) => still !== null) ?? null;
}

// ---------------------------------------------------------------------------
// Product facts
// ---------------------------------------------------------------------------

export type PhotoView = "front" | "back" | "side" | "product" | "detail";

/** What the vision model read in a garment's photos, kept per product. */
export interface GarmentFacts {
  /** The view of each photo, by URL. */
  views: Record<string, PhotoView | "other">;
  color: string;
  fabric: string;
  shape: string;
  hardware: string;
  /** The other garment the model wears in the front photos. */
  wornWith: string;
  model: string;
  /** Changed by hand in the editor. */
  edited?: boolean;
  at: string;
}

const factsPath = (productId: number) => `pieces/${productId}/facts.json`;

const FACTS_EXAMPLE = {
  color:
    "warm medium brown with a reddish cinnamon/rust cast, as photographed (brand color 'Marrom Meio Tom'). Not chocolate, not orange.",
  fabric: "smooth medium-weight lycra with a soft satin-matte sheen.",
  shapeTop:
    "Fixed triangle cups, fairly small and pointed at the top. A thin bias binding of the same fabric runs along the lower edge of both cups and continues as the thin back band. Each cup has one short vertical dart rising from the middle of its lower edge. Super-thin parallel straps go straight up from the cup tips. Clean-finished edges, no visible topstitching.",
  shapeBottom:
    "Low-rise brazilian briefs: a gently V-dipping waistline at the front, high-cut legs, narrow tapered back (cheeky, close to a thong). Clean-finished edges, no visible topstitching.",
  hardwareTop:
    "ON THE BACK ONLY: one small silver-tone metal slider on each strap at mid-back height, and one small silver-tone slider on the thin back band. The fronts of the straps and the cups have NO hardware.",
};

function factsPrompt(piece: Piece, photos: number): string {
  const isTop = piece.type !== "bottom";
  const garment = isTop
    ? "the swim TOP (upper piece)"
    : "the swim BRIEFS / bottom (lower piece; hotpants count as briefs)";
  const example = isTop
    ? {
        color: FACTS_EXAMPLE.color,
        fabric: FACTS_EXAMPLE.fabric,
        shape: FACTS_EXAMPLE.shapeTop,
        hardware: FACTS_EXAMPLE.hardwareTop,
      }
    : {
        color: FACTS_EXAMPLE.color,
        fabric: FACTS_EXAMPLE.fabric,
        shape: FACTS_EXAMPLE.shapeBottom,
        hardware: "None.",
      };
  return `You write PRODUCT FACTS for an AI image generator that recreates ONE swimwear piece as a flat-lay packshot from these product photos. The facts must describe the real garment precisely, because they override anything ambiguous in the photos.

Product: "${piece.name}". The piece to describe is ${garment}. Brand color name: "${piece.color ?? ""}".

The ${photos} attached photos are, in order, the product page photos (a model wearing the set, from different angles, and maybe the garment alone).

Return ONLY JSON with these keys (English, concise, no marketing words):
- "views": array of ${photos} items, one per photo in order: "front" (we see the front of the outfit), "back", "side", "product" (the garment alone, no person) or "detail" (a close-up).
- "color": the exact shade as photographed, plus the brand color name in quotes, plus what it is NOT (e.g. "Not chocolate, not orange."). For prints/stripes: colors, scale, direction and how the pattern is placed.
- "fabric": surface and weight (smooth lycra, crepe with fine crinkled texture, ribbed with vertical ribs, etc.) and sheen.
- "shape": cut, coverage and construction of ${isTop ? "the top" : "the briefs"} ONLY: shape, every dart, seam, cut line, fold, binding, gathering and tie, each in its exact position; straps (count, width, where they attach, how they go). Use only what is visible. End with "Clean-finished edges, no visible topstitching." unless stitching is clearly visible.
- "hardware": every slider, ring, clasp, hook or bead of ${isTop ? "the top" : "the briefs"}: count, material, color and WHERE (front or back). Adjusters that sit on the back of the straps or band must be written as "ON THE BACK ONLY: ..." followed by "The fronts of the straps and the cups have NO hardware." Write "None." if there is none.
- "wornWith": one short line describing the ${isTop ? "bottom" : "top"} the model wears in the front photos (to check pairing).

Style example (a different product):
${JSON.stringify(example)}`;
}

/** Wake serves a resized copy (letterboxed) when given a box. */
function sized(url: string, width: number, height: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set("w", String(width));
  parsed.searchParams.set("h", String(height));
  return parsed.toString();
}

const MAX_FACTS_PHOTOS = 8;

/** Studio's generate_text answer. */
interface GeneratedText {
  text: string;
  model: string;
}

/**
 * Asks Studio's generate_text to read the photos: on the org's chat model
 * first, the one the Studio chat uses and pays for; when that fails (Studio
 * without generate_text yet, the org's AI allowance spent), on the org's
 * OpenRouter key in AI providers, the one generate_image already runs on.
 */
async function readPhotos(
  env: Env,
  prompt: string,
  photos: string[],
): Promise<GeneratedText> {
  const request = {
    prompt,
    images: photos.map((url) => ({ uri: sized(url, 1024, 1024) })),
    maxOutputTokens: 4000,
  };
  const call = (args: Record<string, unknown>) =>
    callConnectionTool(
      env,
      "SELF",
      "generate_text",
      { ...request, ...args },
      180_000,
    ) as Promise<GeneratedText>;
  try {
    return await call({});
  } catch (error) {
    console.warn("[still-editor] facts on the chat model failed", error);
    return call({ provider: "openrouter", model: settings(env).FACTS_MODEL });
  }
}

async function draftFacts(env: Env, piece: Piece): Promise<GarmentFacts> {
  const photos = piece.photos.slice(0, MAX_FACTS_PHOTOS);
  const { text, model } = await readPhotos(
    env,
    factsPrompt(piece, photos.length),
    photos,
  );
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("The facts model did not return JSON");
  const facts = JSON.parse(json) as Partial<Record<string, unknown>>;
  const views = Array.isArray(facts.views) ? facts.views : [];
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    views: Object.fromEntries(
      photos.map((url, i) => {
        const view = views[i];
        return [
          url,
          ["front", "back", "side", "product", "detail"].includes(view)
            ? (view as PhotoView)
            : "other",
        ];
      }),
    ),
    color: str(facts.color),
    fabric: str(facts.fabric),
    shape: str(facts.shape),
    hardware: str(facts.hardware),
    wornWith: str(facts.wornWith),
    model,
    at: new Date().toISOString(),
  };
}

export const readFacts = (store: Storage, productId: number) =>
  store.getJson<GarmentFacts>(factsPath(productId));

export const writeFacts = (
  store: Storage,
  productId: number,
  facts: GarmentFacts,
) => store.putJson(factsPath(productId), facts);

/**
 * The garment's facts: the stored ones, or a new draft. Null when neither
 * model could read the photos: the Still is then made from the photos alone,
 * as it would be without facts.
 */
export async function garmentFacts(
  env: Env,
  store: Storage,
  piece: Piece,
): Promise<GarmentFacts | null> {
  const stored = await readFacts(store, piece.productId);
  if (stored) return stored;
  if (piece.photos.length === 0) return null;
  try {
    const drafted = await draftFacts(env, piece);
    await writeFacts(store, piece.productId, drafted);
    return drafted;
  } catch (error) {
    console.warn("[still-editor] no facts for", piece.productId, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const VIEW_LABEL: Record<PhotoView, string> = {
  front: "the real set worn by a model, FRONT view",
  side: "the real set worn by a model, SIDE view (only to understand how the pieces connect)",
  back: "the real set worn by a model, BACK view (only to understand how the pieces connect)",
  product:
    "the real garment on its own, no person (use it for shape, edges and details)",
  detail:
    "a close-up of the real garment (use it for fabric texture and details)",
};

const BACKGROUND_LINE: Record<Background, string> = {
  white: "Pure white seamless background (#FFFFFF).",
  grey: "Plain medium-light neutral grey seamless studio background (#A8A8A8), evenly lit, the same grey everywhere.",
};

// The prompt of the production batches (poc-still, padrão Still, 12/11/2026).
const PROMPT = `You are a professional e-commerce product photographer and retoucher specialized in swimwear.

REFERENCES
{{references}}

TASK
Create ONE clean product photo (packshot) of this swimwear set, FRONT view: the swim top in the UPPER half of the image and the swim briefs in the LOWER half. Both pieces at the same real-world scale, each centered horizontally, clearly separated by a band of empty background, never touching or overlapping.

HOW TO READ THE REFERENCES
- Build the image from the front-facing references; use the other angles only to understand how straps, sides and closures connect.
- The PRODUCT FACTS below describe the real product. They override anything ambiguous in the photos.

TEXTURE AND CUT LINES
- Reproduce the real fabric surface exactly as in the references: its grain, matte or sheen, print scale and direction.
- Reproduce every panel line, fold, dart, cutout and shaped edge in its exact position and shape. Add none that are not there.
- Edges are clean-finished (folded or bonded inward): NO visible topstitching line along the edges, leg openings, waistband, neckline or straps. Seams that exist are subtle, smooth and the same color as the fabric, never heavy dotted stitching.

SHAPE AND HARDWARE
- Keep the exact cut and coverage described; do not turn it into a generic bikini shape.
- Place every adjuster, slider, ring and clasp exactly where it is on the real garment, with the count, material and color stated. Hardware that sits on the back of the garment is NOT visible in a front view: never move it to the front of the straps.

PRODUCT FACTS
{{facts}}

PHOTO REQUIREMENTS
- Show only the garments. No model, no body, no skin, no hair, no mannequin, no hanger, no props, no text.
- Invisible/ghost mannequin style, FRONT view, each piece whole, visible and symmetric.
- Lighting: broad, diffuse, soft light. Very soft, low-intensity shadows; no hard shadows, no strong contrast. Slightly warm color temperature, without changing the fabric color stated in PRODUCT FACTS.
- Background: {{background}}
- Light retouching only: keep the fabric looking like the real material, with its natural texture and small natural folds. No smoothing, no plastic or CGI look.
- Photorealistic, sharp focus, high detail, e-commerce catalog quality.

FINAL CHECK
Compare with the references and the PRODUCT FACTS: same texture, same cut lines and coverage, no outline stitching, exact color, and every piece of hardware in the right place for this FRONT view.`;

const isNone = (value: string) => /^none\.?$/i.test(value.trim());

/** PRODUCT FACTS lines: color and fabric of the piece, both shapes, hardware. */
export function factLines(
  piece: GarmentFacts | null,
  top: GarmentFacts | null,
  bottom: GarmentFacts | null,
): string[] {
  const hardware = [
    top?.hardware,
    bottom && !isNone(bottom.hardware) ? `Briefs: ${bottom.hardware}` : null,
  ].filter((line): line is string => Boolean(line?.trim()));
  return [
    piece?.color && `COLOR: ${piece.color}`,
    piece?.fabric && `FABRIC AND TEXTURE: ${piece.fabric}`,
    top?.shape && `TOP: ${top.shape}`,
    bottom?.shape && `BRIEFS: ${bottom.shape}`,
    hardware.length > 0 && `HARDWARE: ${hardware.join(" ")}`,
  ].filter((line): line is string => typeof line === "string");
}

export function buildCreatePrompt(args: {
  views: Array<PhotoView | null>;
  facts: string[];
  background: Background;
}): string {
  const references = args.views
    .map(
      (view, i) =>
        `- Reference image ${i + 1}: ${view ? VIEW_LABEL[view] : "the real set worn by a model"}.`,
    )
    .join("\n");
  const facts = args.facts.length
    ? args.facts.map((line) => `- ${line}`).join("\n")
    : "- (no product facts given: follow the references exactly)";
  return PROMPT.replace("{{references}}", references)
    .replace("{{facts}}", facts)
    .replace("{{background}}", BACKGROUND_LINE[args.background]);
}

/**
 * Up to three front photos, one of the garment alone and one of the back, in
 * gallery order. Without facts the views are unknown: the first three photos.
 */
export function pickReferences(
  photos: string[],
  views: GarmentFacts["views"] | null,
): Array<{ url: string; view: PhotoView | null }> {
  if (!views) return photos.slice(0, 3).map((url) => ({ url, view: null }));
  const of = (view: PhotoView, count: number) =>
    photos
      .filter((url) => views[url] === view)
      .slice(0, count)
      .map((url) => ({ url, view }));
  const chosen = [...of("front", 3), ...of("product", 1), ...of("back", 1)];
  if (!chosen.some((ref) => ref.view === "front") && photos[0]) {
    chosen.unshift({ url: photos[0], view: "front" });
  }
  return chosen;
}

/** Light garments come out greyish when cut from white, so go on grey. */
export const isLightColor = (color: string | null) =>
  /off-?white|branc|white|ivory|creme|cream|marfim|p[eé]rola|argila|areia|bege|nude/i.test(
    color ?? "",
  );

/** A garment more than this share near-white is generated again on grey. */
const LIGHT_SHARE_LIMIT = 0.75;

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface PairScale {
  scale: number;
  /** The pair's scale would push the garment past the frame's fit limits. */
  reduced: boolean;
}

/**
 * The scale of the new garment: the one that gives the pair's half of the
 * generation the width of the pair's published Still, capped at the frame's
 * fit limits; without a pair Still, the scale that fits both garments, as the
 * production batches composed a pair.
 */
export async function pairScale(args: {
  pieceHalf: Pixels;
  pairHalf: Pixels;
  bg: [number, number, number];
  plate: Pixels;
  pairWidth: number | null;
}): Promise<PairScale> {
  const box = pieceBox(args.pieceHalf, args.bg);
  if (!box) throw new Error("No garment found in the generated image");
  const fit = fitScale(box);
  const pairBox = pieceBox(args.pairHalf, args.bg);
  if (!pairBox) return { scale: fit, reduced: false };
  if (!args.pairWidth) {
    return { scale: Math.min(fit, fitScale(pairBox)), reduced: false };
  }
  const scale = await scaleForWidth(
    args.pairHalf,
    args.bg,
    args.plate,
    args.pairWidth,
  );
  return scale > fit * 1.001
    ? { scale: fit, reduced: true }
    : { scale, reduced: false };
}

const boxWidth = (box: ReturnType<typeof stillBox>) =>
  box ? box.x1 - box.x0 + 1 : null;

export async function runCreate(args: {
  env: Env;
  store: Storage;
  piece: Piece;
  pair: Piece | null;
  versionId: string;
  model: string;
  user: User;
  onPhase?: (phase: JobPhase) => Promise<void>;
}): Promise<Version> {
  const { env, store, piece, pair, versionId } = args;
  if (!piece.type) throw new Error("This product is not a top or a bottom");
  const base = `pieces/${piece.productId}`;
  const plate = await loadPlate(store);

  await args.onPhase?.("facts");
  const [facts, pairFacts] = await Promise.all([
    garmentFacts(env, store, piece),
    pair ? garmentFacts(env, store, pair) : null,
  ]);
  const isTop = piece.type === "top";
  const refs = pickReferences(piece.photos, facts?.views ?? null);
  const lines = factLines(
    facts,
    isTop ? facts : pairFacts,
    isTop ? pairFacts : facts,
  );

  // The generation, on grey for a light garment (and again on grey when a
  // garment taken for dark comes out near white).
  await args.onPhase?.("generating");
  const rawPath = `${base}/sources/${versionId}`;
  let background: Background = isLightColor(piece.color) ? "grey" : "white";
  let raw: Pixels;
  for (;;) {
    const output = await generateImage(env, {
      model: args.model,
      prompt: buildCreatePrompt({
        views: refs.map((ref) => ref.view),
        facts: lines,
        background,
      }),
      references: refs.map((ref) => ref.url),
      shape: "2:3",
    });
    await keepGenerated(env, store, output, rawPath);
    const bytes = await store.get(rawPath);
    if (!bytes) throw new Error("The generated image was not stored");
    raw = await decodeImage(bytes);
    if (background === "grey" || lightShare(raw) <= LIGHT_SHARE_LIMIT) break;
    background = "grey";
  }

  await args.onPhase?.("composing");
  const bg = borderColor(raw);
  const cut = splitRow(raw, bg);
  if (cut === null) {
    throw new Error(
      "The top and the bottom came out touching and cannot be cut apart. Generate again.",
    );
  }
  const upper = crop(raw, 0, 0, raw.width, cut);
  const lower = crop(raw, 0, cut, raw.width, raw.height - cut);
  const pieceHalf = isTop ? upper : lower;
  const pairStill = pair?.still?.url
    ? await decodeImage(await fetchBytes(pair.still.url))
    : null;
  const { scale, reduced } = await pairScale({
    pieceHalf,
    pairHalf: isTop ? lower : upper,
    bg,
    plate,
    pairWidth: pairStill ? boxWidth(stillBox(pairStill, plate)) : null,
  });
  const still = await compose(pieceHalf, bg, plate, scale);
  const targetWidth = boxWidth(stillBox(still, plate));

  // The garment alone is the version's model output, what an edit of this
  // version starts from; the whole generation is the source of edits that
  // start from the original.
  await store.put(
    `${base}/versions/${versionId}-model`,
    await encodeStill(pieceHalf),
    "image/jpeg",
  );
  await store.put(
    `${base}/versions/${versionId}.jpg`,
    await encodeStill(still),
    "image/jpeg",
  );
  const source: PieceSource = {
    raw: rawPath,
    half: isTop ? "upper" : "lower",
    background,
    ...(facts
      ? {
          facts: {
            color: facts.color,
            fabric: facts.fabric,
            shape: facts.shape,
            hardware: facts.hardware,
          },
        }
      : {}),
    ...(pair ? { pairProductId: pair.productId } : {}),
    targetWidth,
  };
  await store.putJson(`${base}/source.json`, source);
  const version: Version = {
    id: versionId,
    productId: piece.productId,
    parentId: null,
    base: "created",
    prompt: "",
    model: args.model,
    background,
    targetWidth,
    pairProductId: pair?.productId ?? null,
    ...(reduced ? { outOfPairScale: true } : {}),
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

// ---------------------------------------------------------------------------
// A Still that left its order
// ---------------------------------------------------------------------------

/**
 * Puts a Still that left the Still's order back on it: the same image is
 * published at the Still's order on every variant (Wake cannot change an
 * image's order), then the copies left at the old order are deleted.
 */
export async function repositionStill(args: {
  env: Env;
  store: Storage;
  productId: number;
  publicationId: string;
  user: User;
}): Promise<Publication> {
  const { env, store, publicationId } = args;
  const piece = await loadPiece(env, args.productId);
  if (piece.still) throw new Error("This product's Still is in place");
  const plate = await loadPlate(store);
  const moved = await findMovedStill(env, piece, plate);
  if (!moved) throw new Error("No Still was found outside its order");

  const imagePath = `pieces/${piece.productId}/publications/${publicationId}-moved.jpg`;
  await store.put(imagePath, await fetchBytes(moved.url), "image/jpeg");
  const publication = await publishStill({
    env,
    store,
    piece,
    imagePath,
    expectedStillId: null,
    publicationId,
    kind: "reposition",
    from: String(moved.imageId),
    sizeFactor: 1,
    user: args.user,
  });
  if (publication.status !== "published") return publication;

  const leftovers: number[] = [];
  for (const variant of publication.variants) {
    const images = await listVariantImages(env, variant.variantId);
    for (const image of images.filter((i) => i.order === moved.order)) {
      if (!(await onPlateAt(image, plate))) continue;
      try {
        await callConnectionTool(
          env,
          "WAKE",
          "WAKE_ADMIN_VARIANT_IMAGE_DELETE",
          { variantId: variant.variantId, imageId: image.id },
        );
        variant.removed.push(image.id);
      } catch {
        leftovers.push(variant.variantId);
      }
    }
  }
  const done: Publication = leftovers.length
    ? {
        ...publication,
        error: `The Still is back in place, but the copy at order ${moved.order} is still on variants ${leftovers.join(", ")}`,
      }
    : publication;
  await store.putJson(
    `pieces/${piece.productId}/publications/${publicationId}.json`,
    done,
  );
  return done;
}
