import { describe, expect, it } from "bun:test";
import { hasMorePages, normalizeDateRange } from "./orders.ts";

describe("normalizeDateRange", () => {
  it("turns bare days into the whole day", () => {
    expect(
      normalizeDateRange({
        dataInicial: "2026-11-25",
        dataFinal: "2026-11-25",
      }),
    ).toEqual({
      dataInicial: "2026-11-25 00:00:00",
      dataFinal: "2026-11-25 23:59:59",
    });
  });

  it("keeps explicit times and accepts the ISO separator", () => {
    expect(
      normalizeDateRange({
        dataInicial: "2026-11-25T10:00:00",
        dataFinal: "2026-11-25 10:59:59",
      }),
    ).toEqual({
      dataInicial: "2026-11-25 10:00:00",
      dataFinal: "2026-11-25 10:59:59",
    });
  });

  it("leaves missing dates missing", () => {
    expect(normalizeDateRange({})).toEqual({
      dataInicial: undefined,
      dataFinal: undefined,
    });
  });
});

describe("hasMorePages", () => {
  it("follows Wake's total when there is one", () => {
    expect(hasMorePages(5, 50, 50, 263)).toBe(true);
    expect(hasMorePages(6, 50, 13, 263)).toBe(false);
    expect(hasMorePages(1, 50, 50, 50)).toBe(false);
  });

  it("falls back to a full page without a total", () => {
    expect(hasMorePages(1, 50, 50, null)).toBe(true);
    expect(hasMorePages(1, 50, 49, null)).toBe(false);
  });
});
