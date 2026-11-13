/**
 * Still image processing on raw RGBA pixels, with WebAssembly codecs. The
 * control-plane runner ships the bundle without node_modules, so native image
 * libraries are not available; the .wasm files are emitted next to the server
 * bundle by `bun build`.
 *
 * A Still is one garment, front view, on the brand's backdrop plate, in a 4×5
 * frame. The image model paints the garment on a plain (white or grey)
 * background; `compose` lifts it onto the plate: background and shadow pixels
 * multiply the plate, garment pixels keep their color.
 */
import jpegDecWasm from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm" with { type: "file" };
import jpegEncWasm from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm" with { type: "file" };
import decodeJpegRaw, { init as initJpegDec } from "@jsquash/jpeg/decode";
import encodeJpegRaw, { init as initJpegEnc } from "@jsquash/jpeg/encode";
// @ts-expect-error The package types its wasm-bindgen module; with Bun the
// file import is the emitted path.
import pngWasm from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm" with { type: "file" };
import decodePngRaw, { init as initPng } from "@jsquash/png/decode";
import resizeRaw, { initResize } from "@jsquash/resize";
// @ts-expect-error Same as the PNG codec above.
import resizeWasm from "@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm" with { type: "file" };
import { readFile } from "node:fs/promises";

export const FRAME_WIDTH = 1600;
export const FRAME_HEIGHT = 2000;
/** Largest share of the frame the garment may take when no scale is given. */
const FIT_WIDTH = 0.76;
const FIT_HEIGHT = 0.66;
/** Wake rejects images over 2 MB. */
const MAX_STILL_BYTES = 2 * 1024 * 1024;

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export type RGB = [number, number, number];

// jsquash returns ImageData, which Bun does not define.
if (!("ImageData" in globalThis)) {
  (globalThis as Record<string, unknown>).ImageData = class {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  };
}

let codecs: Promise<void> | null = null;
function initCodecs(): Promise<void> {
  codecs ??= (async () => {
    const wasm = (path: string) => readFile(path);
    await initJpegDec({ wasmBinary: await wasm(jpegDecWasm) } as never);
    await initJpegEnc({ wasmBinary: await wasm(jpegEncWasm) } as never);
    await initPng((await WebAssembly.compile(await wasm(pngWasm))) as never);
    await initResize(
      (await WebAssembly.compile(await wasm(resizeWasm))) as never,
    );
  })();
  return codecs;
}

const toBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

/** Decodes a PNG or JPEG. */
export async function decodeImage(bytes: Uint8Array): Promise<Pixels> {
  await initCodecs();
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const image = isPng
    ? await decodePngRaw(toBuffer(bytes))
    : await decodeJpegRaw(toBuffer(bytes));
  return { width: image.width, height: image.height, data: image.data };
}

async function resizeTo(
  image: Pixels,
  width: number,
  height: number,
  method: "lanczos3" | "mitchell",
): Promise<Pixels> {
  await initCodecs();
  const out = await resizeRaw(image as unknown as ImageData, {
    width,
    height,
    method,
    fitMethod: "stretch",
    premultiply: true,
    linearRGB: false,
  });
  return { width: out.width, height: out.height, data: out.data };
}

/** JPEG under the Wake size limit (quality 93 first, lower only if needed). */
export async function encodeStill(image: Pixels): Promise<Uint8Array> {
  await initCodecs();
  for (const quality of [93, 90, 85, 80]) {
    const bytes = new Uint8Array(
      await encodeJpegRaw(image as unknown as ImageData, { quality }),
    );
    if (bytes.byteLength <= MAX_STILL_BYTES) return bytes;
  }
  throw new Error("The Still does not fit in 2 MB even at JPEG quality 80");
}

export function crop(
  image: Pixels,
  left: number,
  top: number,
  width: number,
  height: number,
): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((top + y) * image.width + left) * 4;
    data.set(image.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { width, height, data };
}

const diff = (data: Uint8ClampedArray, i: number, bg: RGB) =>
  Math.abs(data[i] - bg[0]) +
  Math.abs(data[i + 1] - bg[1]) +
  Math.abs(data[i + 2] - bg[2]);

/** Background color: the median of the image border. */
export function borderColor(image: Pixels): RGB {
  const { width, height, data } = image;
  const channels: number[][] = [[], [], []];
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
  };
  for (let x = 0; x < width; x += 4) {
    push(x, 2);
    push(x, height - 3);
  }
  for (let y = 0; y < height; y += 4) {
    push(2, y);
    push(width - 3, y);
  }
  return channels.map(
    (values) => values.sort((a, b) => a - b)[values.length >> 1],
  ) as RGB;
}

/**
 * The row to cut a two-garment generation at: the middle of the widest band of
 * background rows between 25% and 75% of the height. Null when the garments
 * touch.
 */
export function splitRow(image: Pixels, bg: RGB): number | null {
  const { width, height, data } = image;
  const blank = (y: number) => {
    for (let x = 0; x < width; x++) {
      if (diff(data, (y * width + x) * 4, bg) > 45) return false;
    }
    return true;
  };
  let best = { start: -1, length: 0 };
  let current = -1;
  for (let y = Math.floor(height * 0.25); y <= Math.floor(height * 0.75); y++) {
    if (blank(y)) {
      if (current < 0) current = y;
      if (y - current + 1 > best.length) {
        best = { start: current, length: y - current + 1 };
      }
    } else current = -1;
  }
  return best.length < 4 ? null : best.start + Math.floor(best.length / 2);
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The box around every pixel that differs from the background. */
export function pieceBox(image: Pixels, bg: RGB): Box | null {
  const { width, height, data } = image;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (diff(data, (y * width + x) * 4, bg) > 60) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** The scale that makes the garment fill the frame up to the fit limits. */
export function fitScale(box: Box): number {
  return Math.min(
    (FRAME_WIDTH * FIT_WIDTH) / (box.x1 - box.x0 + 1),
    (FRAME_HEIGHT * FIT_HEIGHT) / (box.y1 - box.y0 + 1),
  );
}

const luminance = (r: number, g: number, b: number) =>
  0.299 * r + 0.587 * g + 0.114 * b;
const ramp = (value: number, from: number, to: number) =>
  Math.min(1, Math.max(0, (value - from) / (to - from)));

/**
 * Garment mask for a light garment generated on grey: soft alpha per pixel,
 * then everything inside the garment's outline and more than 3 px from it is
 * solid, so shaded parts of a light garment (lining, folds) don't let the plate
 * show through. Closed gaps that are background colored stay outside.
 */
function greyMask(scaled: Pixels, bg: RGB): Float32Array {
  const { width: w, height: h, data } = scaled;
  const n = w * h;
  const bgLum = luminance(bg[0], bg[1], bg[2]);
  let pieceLum = bgLum * 1.3;
  const lums: number[] = [];
  for (let i = 0; i < n; i += 7) {
    const l = luminance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (l > bgLum * 1.12) lums.push(l);
  }
  if (lums.length > 50) {
    pieceLum = lums.sort((a, b) => a - b)[Math.floor(lums.length * 0.5)];
  }
  const alpha = new Float32Array(n);
  const ratios = (i: number) => {
    const r0 = data[i * 4] / Math.max(1, bg[0]);
    const r1 = data[i * 4 + 1] / Math.max(1, bg[1]);
    const r2 = data[i * 4 + 2] / Math.max(1, bg[2]);
    const k = (r0 + r1 + r2) / 3;
    const hue = Math.max(Math.abs(r0 - k), Math.abs(r1 - k), Math.abs(r2 - k));
    return { k, hue };
  };
  for (let i = 0; i < n; i++) {
    const { k, hue } = ratios(i);
    const bright = ramp(
      luminance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]),
      bgLum * 1.02,
      bgLum + 0.7 * (pieceLum - bgLum),
    );
    alpha[i] = Math.max(bright, ramp(hue, 0.04, 0.1), ramp(1 - k, 0.4, 0.6));
  }
  // Outside = reachable from the border without crossing the garment.
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  const reach = (i: number) => {
    if (!outside[i] && alpha[i] <= 0.5) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    reach(x);
    reach((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    reach(y * w);
    reach(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) reach(i - 1);
    if (x < w - 1) reach(i + 1);
    if (y > 0) reach(i - w);
    if (y < h - 1) reach(i + w);
  }
  // Closed gaps (e.g. between a halter strap and the cup) that are mostly
  // background colored are background too.
  const seen = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (outside[start] || seen[start] || alpha[start] > 0.5) continue;
    const component: number[] = [];
    const pending = [start];
    seen[start] = 1;
    while (pending.length) {
      const i = pending.pop() as number;
      const x = i % w;
      const y = (i / w) | 0;
      component.push(i);
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ]) {
        if (j >= 0 && !seen[j] && !outside[j] && alpha[j] <= 0.5) {
          seen[j] = 1;
          pending.push(j);
        }
      }
    }
    let backgroundLike = 0;
    for (const i of component) {
      const { k, hue } = ratios(i);
      if (Math.abs(k - 1) < 0.06 && hue < 0.03) backgroundLike++;
    }
    if (component.length > 200 && backgroundLike / component.length > 0.6) {
      for (const i of component) outside[i] = 1;
    }
  }
  // Core = inside and more than R px from any outside pixel (square erosion).
  const R = 3;
  const rowInner = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inner = 1;
      for (let d = -R; d <= R && inner; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= w || outside[y * w + xx]) inner = 0;
      }
      rowInner[y * w + x] = inner;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inner = 1;
      for (let d = -R; d <= R && inner; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= h || !rowInner[yy * w + x]) inner = 0;
      }
      if (inner) alpha[y * w + x] = 1;
    }
  }
  return alpha;
}

/**
 * Places the garment of `half` (painted on a plain background `bg`) centred on
 * the plate, scaled by `scale` (default: fill up to the fit limits).
 */
export async function compose(
  half: Pixels,
  bg: RGB,
  plate: Pixels,
  scale?: number,
): Promise<Pixels> {
  const box = pieceBox(half, bg);
  if (!box) throw new Error("No garment found in the generated image");
  const s = scale ?? fitScale(box);
  const sw = Math.max(1, Math.round(half.width * s));
  const sh = Math.max(1, Math.round(half.height * s));
  const greyBg = luminance(bg[0], bg[1], bg[2]) < 235;
  // On grey, Lanczos leaves a dark ring on the sharp edge of a light garment
  // that the plate multiply reads as a shadow outline; Mitchell barely does.
  const scaled = await resizeTo(half, sw, sh, greyBg ? "mitchell" : "lanczos3");
  const mask = greyBg ? greyMask(scaled, bg) : null;
  const ox = Math.round(FRAME_WIDTH / 2 - ((box.x0 + box.x1) / 2) * s);
  const oy = Math.round(FRAME_HEIGHT / 2 - ((box.y0 + box.y1) / 2) * s);
  const out = new Uint8ClampedArray(FRAME_WIDTH * FRAME_HEIGHT * 4);
  const src: number[] = [0, 0, 0];
  for (let y = 0; y < FRAME_HEIGHT; y++) {
    for (let x = 0; x < FRAME_WIDTH; x++) {
      const o = (y * FRAME_WIDTH + x) * 4;
      const sx = x - ox;
      const sy = y - oy;
      const inside = sx >= 0 && sy >= 0 && sx < sw && sy < sh;
      const si = (sy * sw + sx) * 4;
      for (let c = 0; c < 3; c++) src[c] = inside ? scaled.data[si + c] : bg[c];
      let alpha: number;
      if (mask) {
        alpha = inside ? mask[sy * sw + sx] : 0;
      } else {
        // On white: garment = dark enough or colored.
        const lum = luminance(src[0], src[1], src[2]);
        const chroma = Math.max(...src) - Math.min(...src);
        alpha = Math.max(ramp(255 - lum, 60, 110), ramp(chroma, 12, 30));
      }
      for (let c = 0; c < 3; c++) {
        const multiplied =
          plate.data[o + c] * Math.min(1, src[c] / Math.max(1, bg[c]));
        // On grey, an edge pixel mixes garment and grey: take the grey out so
        // no grey outline is left on the plate.
        const garment =
          mask && alpha > 0.05 && alpha < 1
            ? Math.min(255, Math.max(0, (src[c] - (1 - alpha) * bg[c]) / alpha))
            : src[c];
        out[o + c] = Math.round(alpha * garment + (1 - alpha) * multiplied);
      }
      out[o + 3] = 255;
    }
  }
  return { width: FRAME_WIDTH, height: FRAME_HEIGHT, data: out };
}

/** Bounding box of the garment in a composed Still (vs. the plate). */
export function stillBox(still: Pixels, plate: Pixels): Box | null {
  const { width, height, data } = still;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const away = Math.max(
        Math.abs(data[i] - plate.data[i]),
        Math.abs(data[i + 1] - plate.data[i + 1]),
        Math.abs(data[i + 2] - plate.data[i + 2]),
      );
      if (away < 24) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Composes `half` so the garment is as wide on the frame as `targetWidth`
 * (the current Still's garment width), times `sizeFactor`: garment width
 * follows the body, while a requested change in coverage changes the height.
 */
export async function composeAtWidth(
  half: Pixels,
  bg: RGB,
  plate: Pixels,
  targetWidth: number,
  sizeFactor = 1,
): Promise<Pixels> {
  const box = pieceBox(half, bg);
  if (!box) throw new Error("No garment found in the generated image");
  const first = await compose(half, bg, plate, fitScale(box));
  const measured = stillBox(first, plate);
  if (!measured) return first;
  const scale =
    fitScale(box) *
    ((targetWidth * sizeFactor) / (measured.x1 - measured.x0 + 1));
  return compose(half, bg, plate, scale);
}

const BACKDROP: RGB = [225, 216, 204];
const BACKDROP_TOLERANCE = 3;
const INK = 14;

export interface StillCheck {
  ok: boolean;
  frame: boolean;
  backdrop: boolean;
  widthShare: number;
  heightShare: number;
  margins: { left: number; right: number; top: number; bottom: number };
  offCentre: number;
  problems: string[];
}

/**
 * The Still standard: 4×5 at 1600×2000, the brand's backdrop, the garment
 * inside the frame with a margin and roughly centred.
 */
export function checkStill(still: Pixels): StillCheck {
  const { width, height, data } = still;
  const edge = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const sum = [0, 0, 0];
  let count = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (x > edge && x < width - edge && y > edge && y < height - edge) {
        continue;
      }
      const i = (y * width + x) * 4;
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
      count++;
    }
  }
  const background = sum.map((v) => Math.round(v / count));
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const away = Math.max(
        Math.abs(data[i] - background[0]),
        Math.abs(data[i + 1] - background[1]),
        Math.abs(data[i + 2] - background[2]),
      );
      if (away < INK) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  const pct = (value: number, of: number) => Math.round((100 * value) / of);
  const frame = width === FRAME_WIDTH && height === FRAME_HEIGHT;
  const backdrop = background.every(
    (v, i) => Math.abs(v - BACKDROP[i]) <= BACKDROP_TOLERANCE,
  );
  const empty = right < 0;
  const margins = empty
    ? { left: 0, right: 0, top: 0, bottom: 0 }
    : {
        left: pct(left, width),
        right: pct(width - right, width),
        top: pct(top, height),
        bottom: pct(height - bottom, height),
      };
  const widthShare = empty ? 0 : pct(right - left, width);
  const heightShare = empty ? 0 : pct(bottom - top, height);
  const offCentre = empty
    ? 0
    : pct(Math.abs((left + right) / 2 - width / 2), width);
  const problems: string[] = [];
  if (!frame) problems.push(`frame is ${width}×${height}, not 1600×2000`);
  if (!backdrop) problems.push("background is not the brand's plate");
  if (empty) problems.push("no garment found");
  if (!empty && Math.min(...Object.values(margins)) < 3) {
    problems.push("the garment touches the edge of the frame");
  }
  if (!empty && (widthShare > 85 || heightShare > 75)) {
    problems.push("the garment is too large for the frame");
  }
  if (!empty && offCentre > 3) problems.push("the garment is off centre");
  return {
    ok: problems.length === 0,
    frame,
    backdrop,
    widthShare,
    heightShare,
    margins,
    offCentre,
    problems,
  };
}
