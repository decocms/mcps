// Pulls canvas.fig (+ meta.json) out of a .fig export without loading the whole
// file: a .fig is a zip where images/ is ~95% of the size, the document ~2%.
// Reads the end-of-central-directory, the central directory, and only the
// entries we need via Blob.slice.
import { inflateSync } from "fflate";

export type Extracted = {
  canvas: Uint8Array;
  meta: Record<string, unknown> | null;
};

const read = async (blob: Blob, start: number, end: number) =>
  new Uint8Array(await blob.slice(start, end).arrayBuffer());

const isFigKiwi = (b: Uint8Array) =>
  new TextDecoder().decode(b.subarray(0, 4)) === "fig-";

type Entry = { method: number; size: number; offset: number };

async function centralDirectory(blob: Blob): Promise<Map<string, Entry>> {
  const tailStart = Math.max(0, blob.size - 65_557);
  const tail = await read(blob, tailStart, blob.size);
  const tv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--)
    if (tv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Não é um zip válido");
  const cdSize = tv.getUint32(eocd + 12, true);
  const cdOffset = tv.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff)
    throw new Error("Arquivo .fig acima de 4 GB não suportado");
  const cd = await read(blob, cdOffset, cdOffset + cdSize);
  const v = new DataView(cd.buffer);
  const entries = new Map<string, Entry>();
  for (
    let p = 0;
    p + 46 <= cd.length && v.getUint32(p, true) === 0x02014b50;
  ) {
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const name = new TextDecoder().decode(
      cd.subarray(p + 46, p + 46 + nameLen),
    );
    entries.set(name, {
      method: v.getUint16(p + 10, true),
      size: v.getUint32(p + 20, true),
      offset: v.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function entryData(blob: Blob, e: Entry): Promise<Uint8Array> {
  const h = new DataView((await read(blob, e.offset, e.offset + 30)).buffer);
  if (h.getUint32(0, true) !== 0x04034b50) throw new Error("zip corrompido");
  const start = e.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
  const raw = await read(blob, start, start + e.size);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateSync(raw);
  throw new Error(`compressão zip não suportada (${e.method})`);
}

export async function extractCanvas(blob: Blob): Promise<Extracted> {
  const head = await read(blob, 0, 8);
  if (isFigKiwi(head))
    return { canvas: await read(blob, 0, blob.size), meta: null };
  if (head[0] !== 0x50 || head[1] !== 0x4b)
    throw new Error("Esse arquivo não é um .fig do Figma");
  const entries = await centralDirectory(blob);
  const canvasEntry = entries.get("canvas.fig");
  if (!canvasEntry)
    throw new Error("O .fig não tem canvas.fig — exportação incompleta?");
  const canvas = await entryData(blob, canvasEntry);
  if (!isFigKiwi(canvas)) throw new Error("canvas.fig inválido");
  const metaEntry = entries.get("meta.json");
  const meta = metaEntry
    ? JSON.parse(new TextDecoder().decode(await entryData(blob, metaEntry)))
    : null;
  return { canvas, meta };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
