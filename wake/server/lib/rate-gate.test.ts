import { describe, expect, it } from "bun:test";
import {
  createRateGate,
  parseRetryAfter,
  RATE_LIMITED,
  RateLimitedError,
} from "./rate-gate.ts";

/** A gate on a fake clock: sleeping advances it. */
function fakeGate(perMinute: number, maxWaitMs: number) {
  let t = 1_000_000;
  const slept: number[] = [];
  const gate = createRateGate({
    perMinute,
    maxWaitMs,
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
  });
  return { gate, slept, advance: (ms: number) => (t += ms) };
}

describe("createRateGate", () => {
  it("lets calls through under the per-minute cap", async () => {
    const { gate, slept } = fakeGate(3, 1000);
    for (let i = 0; i < 3; i++) await gate.acquire("token-a");
    expect(slept).toEqual([]);
  });

  it("waits for a free slot when the wait is short", async () => {
    const { gate, slept, advance } = fakeGate(2, 30_000);
    await gate.acquire("token-a");
    advance(50_000);
    await gate.acquire("token-a");
    await gate.acquire("token-a");
    expect(slept).toEqual([10_000]);
  });

  it("refuses instead of waiting long", async () => {
    const { gate } = fakeGate(1, 1000);
    await gate.acquire("token-a");
    const error = await gate.acquire("token-a").catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error.message.startsWith(RATE_LIMITED)).toBe(true);
    expect(error.retryAfterSeconds).toBe(60);
  });

  it("counts each token apart", async () => {
    const { gate, slept } = fakeGate(1, 1000);
    await gate.acquire("token-a");
    await gate.acquire("token-b");
    expect(slept).toEqual([]);
  });

  it("refuses a blocked token until the block ends, without waiting", async () => {
    const { gate, slept, advance } = fakeGate(100, 60_000);
    gate.block("token-a", 30);
    const error = await gate.acquire("token-a").catch((e) => e);
    expect(error.retryAfterSeconds).toBe(30);
    expect(error.message).toContain("retry-after=30");
    expect(slept).toEqual([]);
    advance(30_000);
    await gate.acquire("token-a");
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates, and defaults to a minute", () => {
    expect(parseRetryAfter("12")).toBe(12);
    expect(parseRetryAfter("0")).toBe(1);
    const now = Date.parse("2026-11-26T12:00:00Z");
    expect(parseRetryAfter("Thu, 26 Nov 2026 12:00:45 GMT", now)).toBe(45);
    expect(parseRetryAfter(null)).toBe(60);
    expect(parseRetryAfter("soon")).toBe(60);
  });
});
