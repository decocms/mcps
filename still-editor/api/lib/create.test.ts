import { describe, expect, it } from "bun:test";
import type { Piece } from "./catalog.ts";
import {
  buildCreatePrompt,
  createBlock,
  factLines,
  type GarmentFacts,
  isLightColor,
  pairScale,
  pickReferences,
} from "./create.ts";
import {
  borderColor,
  compose,
  crop,
  encodeStill,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  isOnPlate,
  jpegSize,
  lightShare,
  type Pixels,
  type RGB,
  splitRow,
  stillBox,
} from "./image.ts";

function canvas(width: number, height: number, color: RGB): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set([...color, 255], i);
  }
  return { width, height, data };
}

function fill(
  image: Pixels,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGB,
) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      image.data.set([...color, 255], (yy * image.width + xx) * 4);
    }
  }
}

/** The brand's plate is a blurred photo: a soft vertical gradient here. */
function plate(): Pixels {
  const image = canvas(FRAME_WIDTH, FRAME_HEIGHT, [0, 0, 0]);
  for (let y = 0; y < FRAME_HEIGHT; y++) {
    const lift = Math.round(6 * (1 - y / FRAME_HEIGHT));
    fill(image, 0, y, FRAME_WIDTH, 1, [222 + lift, 213 + lift, 201 + lift]);
  }
  return image;
}

const WHITE: RGB = [255, 255, 255];
const BROWN: RGB = [120, 70, 40];

/** A generation: a wide top over a narrower bottom, on white. */
function generation(): Pixels {
  const image = canvas(600, 900, WHITE);
  fill(image, 150, 120, 300, 160, BROWN);
  fill(image, 200, 560, 200, 180, BROWN);
  return image;
}

const widthOf = (box: ReturnType<typeof stillBox>) =>
  box ? box.x1 - box.x0 + 1 : 0;

function piece(overrides: Partial<Piece> = {}): Piece {
  return {
    productId: 1,
    name: "Top Cris Mostarda",
    alias: "top-cris-mostarda-1",
    type: "top",
    color: "MOSTARDA",
    lookComplementar: null,
    mainVariantId: 10,
    variantIds: [10],
    still: null,
    images: [],
    photos: ["https://img/1.jpg"],
    ...overrides,
  };
}

const facts = (fields: Partial<GarmentFacts>): GarmentFacts => ({
  views: {},
  color: "",
  fabric: "",
  shape: "",
  hardware: "",
  wornWith: "",
  model: "test",
  at: "2026-11-17T00:00:00.000Z",
  ...fields,
});

describe("createBlock", () => {
  it("lets a top or a bottom without a Still be created", () => {
    expect(createBlock(piece(), null)).toBeNull();
    expect(createBlock(piece({ type: "bottom" }), null)).toBeNull();
  });

  it("sends a piece with a Still, or one that left its order, to editing", () => {
    const still = {
      id: 5,
      url: "https://img/85.jpg",
      order: 85,
      isPrint: false,
    };
    expect(createBlock(piece({ still }), null)).toBe("has-still");
    expect(createBlock(piece(), { imageId: 5, order: 6, url: still.url })).toBe(
      "still-moved",
    );
  });

  it("refuses other garments and pieces with only print images", () => {
    expect(createBlock(piece({ type: null }), null)).toBe("not-garment");
    expect(createBlock(piece({ photos: [] }), null)).toBe("no-model-photos");
  });
});

describe("pickReferences", () => {
  const photos = ["f1", "b1", "f2", "p1", "f3", "f4", "b2"];
  const views = {
    f1: "front",
    b1: "back",
    f2: "front",
    p1: "product",
    f3: "front",
    f4: "front",
    b2: "back",
  } as const;

  it("takes three fronts, the garment alone and one back", () => {
    expect(pickReferences(photos, views).map((ref) => ref.url)).toEqual([
      "f1",
      "f2",
      "f3",
      "p1",
      "b1",
    ]);
  });

  it("uses the first photos when the views are unknown", () => {
    expect(pickReferences(photos, null)).toEqual([
      { url: "f1", view: null },
      { url: "b1", view: null },
      { url: "f2", view: null },
    ]);
  });

  it("keeps a front reference when no photo was read as front", () => {
    const refs = pickReferences(["b1", "b2"], { b1: "back", b2: "back" });
    expect(refs[0]).toEqual({ url: "b1", view: "front" });
  });
});

describe("factLines", () => {
  it("joins the piece's color with both shapes and both hardwares", () => {
    const top = facts({
      color: "mustard",
      fabric: "lycra",
      shape: "bralette",
      hardware: "ON THE BACK ONLY: sliders.",
    });
    const bottom = facts({ shape: "high-cut briefs", hardware: "None." });
    expect(factLines(top, top, bottom)).toEqual([
      "COLOR: mustard",
      "FABRIC AND TEXTURE: lycra",
      "TOP: bralette",
      "BRIEFS: high-cut briefs",
      "HARDWARE: ON THE BACK ONLY: sliders.",
    ]);
  });

  it("leaves out what is unknown", () => {
    expect(factLines(null, null, null)).toEqual([]);
  });
});

describe("buildCreatePrompt", () => {
  it("labels each reference and puts the facts and background in", () => {
    const prompt = buildCreatePrompt({
      views: ["front", null],
      facts: ["COLOR: mustard"],
      background: "grey",
    });
    expect(prompt).toContain(
      "- Reference image 1: the real set worn by a model, FRONT view.",
    );
    expect(prompt).toContain(
      "- Reference image 2: the real set worn by a model.",
    );
    expect(prompt).toContain("- COLOR: mustard");
    expect(prompt).toContain("neutral grey seamless studio background");
    expect(prompt).not.toContain("{{");
  });
});

describe("isLightColor", () => {
  it("sends light colors to grey", () => {
    expect(isLightColor("OFF-WHITE")).toBe(true);
    expect(isLightColor("ARGILA BRANCA")).toBe(true);
    expect(isLightColor("BEGE SATU")).toBe(true);
    expect(isLightColor("MOSTARDA")).toBe(false);
    expect(isLightColor(null)).toBe(false);
  });
});

describe("lightShare", () => {
  it("tells a near-white garment on white from a dark one", () => {
    const light = canvas(300, 300, WHITE);
    fill(light, 100, 100, 100, 100, [238, 234, 226]);
    const dark = canvas(300, 300, WHITE);
    fill(dark, 100, 100, 100, 100, BROWN);
    expect(lightShare(light)).toBeGreaterThan(0.75);
    expect(lightShare(dark)).toBeLessThan(0.1);
  });
});

describe("pairScale", () => {
  const raw = generation();
  const bg = borderColor(raw);
  const cut = splitRow(raw, bg) as number;
  const upper = crop(raw, 0, 0, raw.width, cut);
  const lower = crop(raw, 0, cut, raw.width, raw.height - cut);
  const backdrop = plate();

  it("cuts between the two garments", () => {
    expect(cut).toBeGreaterThan(280);
    expect(cut).toBeLessThan(560);
  });

  it("composes the piece at the scale that gives the pair its Still's width", async () => {
    const pairWidth = 700;
    const { scale, reduced } = await pairScale({
      pieceHalf: upper,
      pairHalf: lower,
      bg,
      plate: backdrop,
      pairWidth,
    });
    expect(reduced).toBe(false);
    const pair = await compose(lower, bg, backdrop, scale);
    expect(
      Math.abs(widthOf(stillBox(pair, backdrop)) - pairWidth),
    ).toBeLessThan(4);
    // Same scale, so the top keeps its 3:2 width over the bottom.
    const top = await compose(upper, bg, backdrop, scale);
    expect(widthOf(stillBox(top, backdrop))).toBeCloseTo(pairWidth * 1.5, -1);
  });

  it("caps the piece at the frame's fit limits and says so", async () => {
    const { reduced } = await pairScale({
      pieceHalf: upper,
      pairHalf: lower,
      bg,
      plate: backdrop,
      pairWidth: 1200,
    });
    expect(reduced).toBe(true);
  });

  it("fits both garments when the pair has no Still", async () => {
    const { scale } = await pairScale({
      pieceHalf: lower,
      pairHalf: upper,
      bg,
      plate: backdrop,
      pairWidth: null,
    });
    // The wider top sets the scale: at most 76% of the frame's width.
    const top = await compose(upper, bg, backdrop, scale);
    expect(widthOf(stillBox(top, backdrop))).toBeLessThanOrEqual(
      Math.ceil(FRAME_WIDTH * 0.76) + 2,
    );
  });
});

describe("isOnPlate", () => {
  const backdrop = plate();

  it("recognizes a Still composed on the plate", async () => {
    const raw = generation();
    const bg = borderColor(raw);
    const still = await compose(crop(raw, 0, 0, raw.width, 400), bg, backdrop);
    expect(isOnPlate(still, backdrop)).toBe(true);
  });

  it("refuses a photo on a similar beige and an image of another size", () => {
    const photo = canvas(FRAME_WIDTH, FRAME_HEIGHT, [225, 214, 199]);
    for (let y = 0; y < FRAME_HEIGHT; y += 50) {
      fill(photo, 0, y, FRAME_WIDTH, 25, [212, 200, 186]);
    }
    expect(isOnPlate(photo, backdrop)).toBe(false);
    expect(isOnPlate(canvas(1500, 2000, [224, 215, 203]), backdrop)).toBe(
      false,
    );
  });
});

describe("jpegSize", () => {
  it("reads the size from the header", async () => {
    const bytes = await encodeStill(canvas(320, 400, BROWN));
    expect(jpegSize(bytes)).toEqual({ width: 320, height: 400 });
  });

  it("gives up on other formats", () => {
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});
