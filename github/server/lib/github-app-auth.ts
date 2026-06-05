/**
 * GitHub App Authentication
 *
 * Generates a JWT from GITHUB_APP_ID + GITHUB_PRIVATE_KEY,
 * then exchanges it for an installation access token.
 *
 * Env vars are read lazily (per call) so this works on Cloudflare Workers
 * where process.env isn't populated at module-init time.
 */

import crypto from "node:crypto";

function normalizePrivateKey(rawKey: string): string {
  let key = rawKey.trim();

  if (!key) return "";

  // Support values copied from env files, secret managers, or JSON strings.
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  // Try JSON extraction before \\n replacement (which would break JSON strings).
  if (key.startsWith("{")) {
    try {
      const parsed = JSON.parse(key) as {
        privateKey?: string;
        private_key?: string;
      };
      const nestedKey = parsed.privateKey || parsed.private_key;
      if (nestedKey) {
        return normalizePrivateKey(nestedKey);
      }
    } catch {
      // Ignore invalid JSON and continue with other heuristics.
    }
  }

  key = key.replace(/\\r/g, "\r").replace(/\\n/g, "\n").trim();

  if (!key.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8").trim();
      if (decoded.includes("-----BEGIN")) {
        key = normalizePrivateKey(decoded);
      }
    } catch {
      // Ignore invalid base64 and continue with other heuristics.
    }
  }

  // Raw base64 DER data without PEM headers (e.g. copied from a PEM file
  // without the -----BEGIN/END----- markers, or stored by a secret manager).
  if (!key.includes("-----BEGIN")) {
    const cleaned = key.replace(/[\s\r\n]/g, "");
    if (cleaned.length > 100 && /^[A-Za-z0-9+/=_-]+$/.test(cleaned)) {
      const standard = cleaned.replace(/-/g, "+").replace(/_/g, "/");
      const lines = standard.match(/.{1,64}/g)!.join("\n");
      for (const label of ["PRIVATE KEY", "RSA PRIVATE KEY"]) {
        const pem = `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
        try {
          crypto.createPrivateKey({ key: pem, format: "pem" });
          return pem;
        } catch {
          continue;
        }
      }
    }
  }

  // Ensure PEM headers/footers are on their own lines (handles cases where
  // newlines between the header and base64 data were stripped).
  if (key.includes("-----BEGIN")) {
    key = key
      .replace(/(-----BEGIN [A-Z ]+-----)([^\n\r])/g, "$1\n$2")
      .replace(/([^\n\r])(-----END [A-Z ]+-----)/g, "$1\n$2");
  }

  return key;
}

function base64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

/**
 * Create a JWT signed with the GitHub App's private key (RS256).
 * Valid for 10 minutes (GitHub's maximum).
 */
export function createAppJWT(): string {
  const appId = process.env.GITHUB_APP_ID || "";
  const privateKey = normalizePrivateKey(process.env.GITHUB_PRIVATE_KEY || "");

  if (!appId || !privateKey) {
    throw new Error(
      "GitHub App credentials not configured. " +
        "Set GITHUB_APP_ID and GITHUB_PRIVATE_KEY environment variables.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iat: now - 60, // 60s clock skew allowance
      exp: now + 600, // 10 minutes
      iss: appId,
    }),
  );

  const signingInput = `${header}.${payload}`;
  let signature: string;

  try {
    const signingKey = crypto.createPrivateKey({
      key: privateKey,
      format: "pem",
    });
    signature = crypto
      .createSign("RSA-SHA256")
      .update(signingInput)
      .sign(signingKey, "base64url");
  } catch (error) {
    const hasPemHeader = privateKey.includes("-----BEGIN");
    const keyLen = privateKey.length;
    throw new Error(
      `Invalid GITHUB_PRIVATE_KEY (length=${keyLen}, hasPemHeader=${hasPemHeader}). ` +
        "Expected a GitHub App PEM private key, " +
        "either as raw PEM, a single-line value with \\n escapes, base64-encoded PEM, " +
        "or raw base64 DER data.",
      { cause: error },
    );
  }

  return `${signingInput}.${signature}`;
}

/**
 * Error thrown when the GitHub App REST API rejects a request. Carries the
 * HTTP status so callers can map it to a clear, leak-free error (e.g. 422 →
 * "repo not in installation", 401/403 → internal config error). The upstream
 * `message` is attached for diagnostics but callers must decide whether it is
 * safe to surface (it is not for 401/403).
 */
export class GitHubAppApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubAppApiError";
  }
}

export interface MintedInstallationToken {
  token: string;
  expires_at: string;
  permissions: Record<string, string>;
  repositories?: Array<{ id: number; name: string; full_name: string }>;
}

/**
 * Mint an installation access token for the GitHub App.
 *
 * An empty body mints an installation-wide token (all repos, all granted
 * permissions). Pass `repository_ids`/`repositories` + `permissions` to scope
 * it down to least privilege. GitHub itself enforces that the repositories
 * belong to the installation and that the permissions are a subset of the
 * App's grant (422 otherwise).
 *
 * The signing JWT defaults to a freshly minted App JWT but can be injected for
 * testing. Non-2xx responses throw `GitHubAppApiError` carrying the HTTP
 * status. The minted token only ever appears in a 2xx body, so it is never
 * included in a thrown error.
 */
export async function mintInstallationAccessToken(
  installationId: number,
  body: {
    repositories?: string[];
    repository_ids?: number[];
    permissions?: Record<string, string>;
  } = {},
  jwt: string = createAppJWT(),
): Promise<MintedInstallationToken> {
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "deco-cms-github-mcp",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    let detail = "";
    try {
      const parsed = (await res.json()) as { message?: string };
      detail = parsed?.message ?? "";
    } catch {
      // Non-JSON error body — ignore.
    }
    throw new GitHubAppApiError(
      res.status,
      detail || `GitHub App token request failed: ${res.status}`,
    );
  }

  const data = (await res.json()) as MintedInstallationToken;
  return {
    token: data.token,
    expires_at: data.expires_at,
    permissions: data.permissions ?? {},
    repositories: data.repositories,
  };
}

/**
 * Get an installation access token for the GitHub App.
 * Picks the first available installation. Used for upstream tool discovery.
 */
export async function getAppInstallationToken(): Promise<string> {
  const jwt = createAppJWT();

  // List installations
  const installationsRes = await fetch(
    "https://api.github.com/app/installations?per_page=1",
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "deco-cms-github-mcp",
      },
    },
  );

  if (!installationsRes.ok) {
    const text = await installationsRes.text();
    throw new Error(
      `Failed to list GitHub App installations: ${installationsRes.status} — ${text}`,
    );
  }

  const installations = (await installationsRes.json()) as Array<{
    id: number;
  }>;

  if (installations.length === 0) {
    throw new Error(
      "GitHub App has no installations. Install the app on at least one account.",
    );
  }

  const minted = await mintInstallationAccessToken(
    installations[0].id,
    {},
    jwt,
  );
  return minted.token;
}
