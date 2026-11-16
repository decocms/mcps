import { expect, test } from "bun:test";
import { zipSync } from "fflate";
import { extractCanvas, sha256Hex, toBase64 } from "./fig-zip.ts";

const canvas = new Uint8Array([
  ...new TextEncoder().encode("fig-kiwi"),
  1,
  2,
  3,
  4,
]);
const meta = new TextEncoder().encode('{"file_name":"Bauducco"}');

test("extracts canvas.fig + meta.json from stored and deflated zips", async () => {
  for (const level of [0, 6] as const) {
    const zip = zipSync(
      {
        "images/x": new Uint8Array(5000),
        "canvas.fig": canvas,
        "meta.json": meta,
      },
      { level },
    );
    const out = await extractCanvas(new Blob([zip]));
    expect(out.canvas).toEqual(canvas);
    expect(out.meta).toEqual({ file_name: "Bauducco" });
  }
});

test("accepts a bare fig-kiwi file and rejects garbage", async () => {
  expect((await extractCanvas(new Blob([canvas]))).canvas).toEqual(canvas);
  expect(extractCanvas(new Blob([new Uint8Array(10)]))).rejects.toThrow();
  const noCanvas = zipSync({ "meta.json": meta });
  expect(extractCanvas(new Blob([noCanvas]))).rejects.toThrow(/canvas.fig/);
});

test("sha256 + base64", async () => {
  expect(await sha256Hex(new TextEncoder().encode("abc"))).toStartWith(
    "ba7816bf8f01cfea",
  );
  expect(toBase64(new TextEncoder().encode("hi"))).toBe("aGk=");
});
