import { signUrl } from "./signer.ts";

const V2_API_BASE = "https://app.crazyegg.com/api/v2";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CrazyEggCreds {
  apiKey: string;
  appKey: string;
}

export interface Snapshot {
  id: string | number;
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

// ─── Legacy v2 Read API (signed) ───────────────────────────────────────────

export async function verifyCredentials(
  creds: CrazyEggCreds,
): Promise<unknown> {
  return getSignedJson("/authenticate.json", creds, { test: "value" });
}

export async function listSnapshots(creds: CrazyEggCreds): Promise<Snapshot[]> {
  return getSignedJson<Snapshot[]>("/snapshots.json", creds);
}
