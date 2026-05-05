import { signUrl } from "./signer.ts";

const TRACK_API_BASE = "https://track.crazyegg.com/api/v1";
const V2_API_BASE = "https://app.crazyegg.com/api/v2";

const MAX_CONVERSIONS_PER_REQUEST = 25;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CrazyEggCreds {
  apiKey: string;
  appKey: string;
}

export interface ConversionEvent {
  goalName: string;
  userIdentifier: string;
  url?: string;
  value?: number;
  currency?: string;
  visitCount?: number;
  landingPage?: string;
  referrer?: string;
  country?: string;
  userAgent?: string;
  timestamp?: string;
  utmParams?: Record<string, string>;
  customData?: Record<string, unknown>;
}

export interface TrackConversionResponse {
  success?: boolean;
  processed?: number;
  [k: string]: unknown;
}

export interface Snapshot {
  id: string;
  name?: string;
  source_url?: string;
  thumbnail_url?: string;
  heatmap_url?: string;
  screenshot_url?: string;
  total_visits?: number;
  total_clicks?: number;
  status?: string;
  [k: string]: unknown;
}

export interface Recording {
  id: string;
  [k: string]: unknown;
}

export interface AbTest {
  id: string;
  [k: string]: unknown;
}

export interface Funnel {
  id: string;
  [k: string]: unknown;
}

export interface Survey {
  id: string;
  [k: string]: unknown;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

async function readResponseBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable body>";
  }
}

async function ensureOk(res: Response, apiName: string): Promise<void> {
  if (res.ok) return;
  const body = await readResponseBody(res);
  const snippet = body.length > 200 ? `${body.slice(0, 200)}…` : body;
  throw new Error(
    `${apiName} request failed: ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ""}`,
  );
}

async function getSignedJson<T>(
  path: string,
  creds: CrazyEggCreds,
  extraParams: Record<string, string> = {},
): Promise<T> {
  const url = signUrl(
    `${V2_API_BASE}${path}`,
    { api_key: creds.apiKey, ...extraParams },
    creds.appKey,
  );
  const res = await fetch(url);
  await ensureOk(res, "Crazy Egg v2");
  return (await res.json()) as T;
}

// ─── Public Conversion Tracking API ────────────────────────────────────────

export async function trackConversion(args: {
  trackingKey: string;
  conversions: ConversionEvent[];
}): Promise<TrackConversionResponse> {
  if (args.conversions.length === 0) {
    throw new Error("trackConversion requires at least one conversion event");
  }
  if (args.conversions.length > MAX_CONVERSIONS_PER_REQUEST) {
    throw new Error(
      `trackConversion accepts at most ${MAX_CONVERSIONS_PER_REQUEST} events per request`,
    );
  }

  const res = await fetch(`${TRACK_API_BASE}/conversions`, {
    method: "POST",
    headers: {
      Authorization: `key ${args.trackingKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ goalConversions: args.conversions }),
  });

  await ensureOk(res, "Crazy Egg tracking");
  return (await res.json()) as TrackConversionResponse;
}

// ─── Legacy v2 Read API (signed) ───────────────────────────────────────────

export async function verifyCredentials(
  creds: CrazyEggCreds,
): Promise<unknown> {
  return getSignedJson("/authenticate.json", creds, { test: "value" });
}

export async function listSnapshots(creds: CrazyEggCreds): Promise<Snapshot[]> {
  return getSignedJson<Snapshot[]>("/snapshots.json", creds);
}

export async function getSnapshot(args: {
  apiKey: string;
  appKey: string;
  snapshotId: string;
}): Promise<Snapshot> {
  return getSignedJson<Snapshot>(`/snapshots/${args.snapshotId}.json`, {
    apiKey: args.apiKey,
    appKey: args.appKey,
  });
}

export async function listRecordings(
  creds: CrazyEggCreds,
): Promise<Recording[]> {
  return getSignedJson<Recording[]>("/recordings.json", creds);
}

export async function listAbTests(creds: CrazyEggCreds): Promise<AbTest[]> {
  return getSignedJson<AbTest[]>("/ab_tests.json", creds);
}

export async function listFunnels(creds: CrazyEggCreds): Promise<Funnel[]> {
  return getSignedJson<Funnel[]>("/funnels.json", creds);
}

export async function listSurveys(creds: CrazyEggCreds): Promise<Survey[]> {
  return getSignedJson<Survey[]>("/surveys.json", creds);
}
