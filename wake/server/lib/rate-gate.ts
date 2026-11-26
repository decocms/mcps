/**
 * Per-token request gate for the Wake Admin API (api.fbits.net).
 *
 * Wake allows 120 requests per minute per token (per endpoint group) and
 * answers HTTP 429 with a `Retry-After` header past that. A token that keeps
 * calling after a 429 gets blocked for an hour, and that block also takes
 * down every other integration sharing the token. So this gate:
 *
 * - paces each token below the limit (a sliding one-minute window), waiting a
 *   little for a free slot and refusing when the wait would be long;
 * - after a 429, refuses every call with that token until `Retry-After` has
 *   passed, without reaching Wake.
 *
 * It never retries: a refusal is a `RateLimitedError` whose message starts
 * with `[wake-rate-limited]` and carries `retry-after=<seconds>`, so callers
 * can back off. State is per process, keyed by a hash of the token.
 */
import { createHash } from "node:crypto";

export const RATE_LIMITED = "[wake-rate-limited]";

const WINDOW_MS = 60_000;
/** Wait used when a 429 comes without a usable Retry-After. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;

export class RateLimitedError extends Error {
  constructor(
    readonly retryAfterSeconds: number,
    reason: string,
  ) {
    super(
      `${RATE_LIMITED} ${reason} Do not retry before ${retryAfterSeconds}s: Wake blocks a token for an hour when it keeps calling past its limit. retry-after=${retryAfterSeconds}`,
    );
    this.name = "RateLimitedError";
  }
}

/** Seconds to wait from a `Retry-After` value (delta-seconds or an HTTP date). */
export function parseRetryAfter(
  value: string | null,
  now = Date.now(),
): number {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.max(1, Math.ceil(seconds));
    }
    const date = Date.parse(value);
    if (Number.isFinite(date)) {
      return Math.max(1, Math.ceil((date - now) / 1000));
    }
  }
  return DEFAULT_RETRY_AFTER_SECONDS;
}

export interface RateGate {
  /** Resolves when a call may go out; throws RateLimitedError otherwise. */
  acquire(token: string): Promise<void>;
  /** Refuses every call with this token for the next `seconds`. */
  block(token: string, seconds: number): void;
}

export function createRateGate(options: {
  perMinute: number;
  /** Longest wait for a free slot before refusing. */
  maxWaitMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): RateGate {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const state = new Map<string, { blockedUntil: number; sent: number[] }>();

  const entry = (token: string) => {
    const key = createHash("sha256").update(token).digest("hex");
    let current = state.get(key);
    if (!current) {
      current = { blockedUntil: 0, sent: [] };
      state.set(key, current);
    }
    return current;
  };

  return {
    async acquire(token) {
      const current = entry(token);
      for (;;) {
        const t = now();
        if (current.blockedUntil > t) {
          throw new RateLimitedError(
            Math.ceil((current.blockedUntil - t) / 1000),
            "Wake answered 429 to this token and asked it to wait.",
          );
        }
        current.sent = current.sent.filter((at) => at > t - WINDOW_MS);
        if (current.sent.length < options.perMinute) {
          current.sent.push(t);
          return;
        }
        const wait = current.sent[0] + WINDOW_MS - t;
        if (wait > options.maxWaitMs) {
          throw new RateLimitedError(
            Math.ceil(wait / 1000),
            `This MCP already sent ${options.perMinute} requests with this token in the last minute.`,
          );
        }
        await sleep(wait);
      }
    },
    block(token, seconds) {
      const current = entry(token);
      current.blockedUntil = Math.max(
        current.blockedUntil,
        now() + seconds * 1000,
      );
    },
  };
}
