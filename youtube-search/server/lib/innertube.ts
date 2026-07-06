/**
 * Innertube (youtubei.js) singleton + helpers.
 *
 * youtubei.js talks to YouTube's private Innertube API — no API key, no
 * OAuth. The trade-off is that it is unofficial: YouTube changes can break
 * it until the library updates, and datacenter IPs occasionally hit
 * "confirm you're not a bot" checks (mostly on stream downloads).
 */
import { Innertube, UniversalCache } from "youtubei.js";

let instance: Promise<Innertube> | null = null;

export function getInnertube(): Promise<Innertube> {
  instance ??= Innertube.create({
    // Persist the deciphered player to disk so only the first call pays
    // the player fetch/decipher cost.
    cache: new UniversalCache(true, "/tmp/yt-cache"),
    generate_session_locally: true,
  });
  return instance;
}

/** Extracts a video id from a raw id or any common YouTube URL shape. */
export function parseVideoId(input: string): string {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(
      `Could not parse a video id from "${input}". Pass an 11-char video id or a YouTube URL.`,
    );
  }

  if (url.hostname === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id && /^[\w-]{11}$/.test(id)) return id;
  }
  const v = url.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) return v;
  const pathMatch = url.pathname.match(
    /\/(?:shorts|embed|live|v)\/([\w-]{11})/,
  );
  if (pathMatch) return pathMatch[1];

  throw new Error(`Could not parse a video id from URL "${input}".`);
}

/**
 * Normalizes youtubei.js failures into actionable messages instead of
 * leaking parser internals to the agent.
 */
export function wrapInnertubeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/sign in to confirm|not a bot|login_required/i.test(message)) {
    return new Error(
      `YouTube flagged this server's IP with a bot check (common for datacenter IPs). Try again later or with a different video. Original error: ${message}`,
    );
  }
  if (/unavailable|private|age.?restricted/i.test(message)) {
    return new Error(`Video is not accessible: ${message}`);
  }
  return new Error(
    `youtubei.js failed (YouTube may have changed and the library needs an update): ${message}`,
  );
}
