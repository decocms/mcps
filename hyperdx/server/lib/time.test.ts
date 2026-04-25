import { describe, expect, test } from "bun:test";
import { resolveTime, resolveTimeRange } from "./time.ts";

const NOW = 1777324800000; // 2026-04-25T00:00:00.000Z — fixed anchor

describe("resolveTime", () => {
  describe("number input", () => {
    test("epoch ms passes through", () => {
      expect(resolveTime(1777037400000)).toBe(1777037400000);
    });

    test("rejects NaN", () => {
      expect(() => resolveTime(Number.NaN)).toThrow(/Invalid epoch ms/);
    });

    test("rejects Infinity", () => {
      expect(() => resolveTime(Number.POSITIVE_INFINITY)).toThrow(
        /Invalid epoch ms/,
      );
    });
  });

  describe("integer string", () => {
    test("treated as epoch ms", () => {
      expect(resolveTime("1777037400000")).toBe(1777037400000);
    });

    test("negative integer string is allowed (pre-1970)", () => {
      expect(resolveTime("-1000")).toBe(-1000);
    });
  });

  describe("'now' arithmetic", () => {
    test("'now' returns the anchor", () => {
      expect(resolveTime("now", { now: NOW })).toBe(NOW);
    });

    test("'now-1h' subtracts an hour", () => {
      expect(resolveTime("now-1h", { now: NOW })).toBe(NOW - 3_600_000);
    });

    test("'now+15m' adds 15 minutes", () => {
      expect(resolveTime("now+15m", { now: NOW })).toBe(NOW + 900_000);
    });

    test("whitespace around sign is tolerated", () => {
      expect(resolveTime("now - 30m", { now: NOW })).toBe(NOW - 1_800_000);
    });

    test("compound 'now-2h30m'", () => {
      expect(resolveTime("now-2h30m", { now: NOW })).toBe(NOW - 9_000_000);
    });

    test("'now-' (no duration) throws", () => {
      expect(() => resolveTime("now-", { now: NOW })).toThrow();
    });
  });

  describe("shorthand 'N ago' duration", () => {
    test("'30m'", () => {
      expect(resolveTime("30m", { now: NOW })).toBe(NOW - 1_800_000);
    });

    test("'2h'", () => {
      expect(resolveTime("2h", { now: NOW })).toBe(NOW - 7_200_000);
    });

    test("'7d'", () => {
      expect(resolveTime("7d", { now: NOW })).toBe(NOW - 7 * 86_400_000);
    });

    test("'15s'", () => {
      expect(resolveTime("15s", { now: NOW })).toBe(NOW - 15_000);
    });

    test("'500ms'", () => {
      expect(resolveTime("500ms", { now: NOW })).toBe(NOW - 500);
    });

    test("compound '2h30m'", () => {
      expect(resolveTime("2h30m", { now: NOW })).toBe(NOW - 9_000_000);
    });

    test("compound '1d2h30m'", () => {
      expect(resolveTime("1d2h30m", { now: NOW })).toBe(
        NOW - 86_400_000 - 7_200_000 - 1_800_000,
      );
    });

    test("malformed duration produces a duration-specific error, not a TZ error", () => {
      // '1h-30m' looks like an attempt at duration arithmetic — the error
      // should explicitly call out durations, not timezones.
      expect(() => resolveTime("1h-30m", { now: NOW })).toThrow(
        /Could not parse '1h-30m' as a duration/,
      );
      // And the misleading "no timezone" message should not appear.
      try {
        resolveTime("1h-30m", { now: NOW });
      } catch (e) {
        expect((e as Error).message).not.toMatch(/has no timezone/);
      }
    });

    test("'1hfoo' is rejected", () => {
      expect(() => resolveTime("1hfoo", { now: NOW })).toThrow();
    });
  });

  describe("ISO 8601 with timezone", () => {
    test("UTC 'Z' suffix", () => {
      expect(resolveTime("2026-04-24T14:00:00Z")).toBe(
        Date.parse("2026-04-24T14:00:00Z"),
      );
    });

    test("negative offset", () => {
      expect(resolveTime("2026-04-24T14:00:00-03:00")).toBe(
        Date.parse("2026-04-24T14:00:00-03:00"),
      );
    });

    test("positive offset", () => {
      expect(resolveTime("2026-04-24T14:00:00+05:30")).toBe(
        Date.parse("2026-04-24T14:00:00+05:30"),
      );
    });

    test("with milliseconds", () => {
      expect(resolveTime("2026-04-24T14:00:00.123-03:00")).toBe(
        Date.parse("2026-04-24T14:00:00.123-03:00"),
      );
    });

    test("GMT-3 worked example matches manual calculation", () => {
      // 14:00 in GMT-3 == 17:00 UTC
      const result = resolveTime("2026-04-24T14:00:00-03:00");
      expect(new Date(result).toISOString()).toBe("2026-04-24T17:00:00.000Z");
    });
  });

  describe("date only", () => {
    test("treated as UTC midnight", () => {
      expect(resolveTime("2026-04-24")).toBe(
        Date.parse("2026-04-24T00:00:00Z"),
      );
    });
  });

  describe("rejection cases", () => {
    test("naive ISO without timezone produces a timezone-specific error", () => {
      expect(() => resolveTime("2026-04-24T14:00:00")).toThrow(/timezone/);
    });

    test("error message instructs how to fix the missing timezone", () => {
      expect(() => resolveTime("2026-04-24T14:00:00")).toThrow(
        /Append 'Z' for UTC or an offset/,
      );
    });

    test("gibberish throws", () => {
      expect(() => resolveTime("tomorrow afternoon")).toThrow();
    });

    test("empty string throws", () => {
      expect(() => resolveTime("")).toThrow(/Empty time value/);
    });

    test("whitespace-only string throws", () => {
      expect(() => resolveTime("   ")).toThrow(/Empty time value/);
    });
  });
});

describe("resolveTimeRange", () => {
  test("uses a single 'now' anchor for both bounds", () => {
    const r = resolveTimeRange("1h", "now", { now: NOW });
    expect(r.endTime - r.startTime).toBe(3_600_000);
    expect(r.endTime).toBe(NOW);
  });

  test("mixed input shapes resolve correctly", () => {
    const r = resolveTimeRange(
      "2026-04-24T13:30:00-03:00",
      "2026-04-24T14:30:00-03:00",
    );
    expect(r.endTime - r.startTime).toBe(3_600_000);
  });

  test("propagates errors from either side", () => {
    expect(() => resolveTimeRange("2026-04-24T14:00:00", "now")).toThrow(
      /timezone/,
    );
    expect(() => resolveTimeRange("now", "")).toThrow(/Empty/);
  });

  test("explicit 'now' option is propagated to both calls", () => {
    const fixedNow = 1_000_000_000_000;
    const r = resolveTimeRange("now-1h", "now", { now: fixedNow });
    expect(r.endTime).toBe(fixedNow);
    expect(r.startTime).toBe(fixedNow - 3_600_000);
  });
});
