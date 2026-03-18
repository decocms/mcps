/**
 * Google Service Account JWT authentication
 *
 * Generates access tokens using a service account JSON key,
 * with support for domain-wide delegation (impersonation).
 */

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

interface CachedToken {
  access_token: string;
  expires_at: number;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_LIFETIME_SECS = 3600;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Cache keyed by subject email to support multiple impersonations
const tokenCache = new Map<string, CachedToken>();

function base64url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function createSignedJwt(
  key: ServiceAccountKey,
  scopes: string[],
  subject?: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload: Record<string, unknown> = {
    iss: key.client_email,
    scope: scopes.join(" "),
    aud: TOKEN_URL,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECS,
  };

  if (subject) {
    payload.sub = subject;
  }

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const cryptoKey = await importPrivateKey(key.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64url(signature)}`;
}

export function parseServiceAccountKey(json: string): ServiceAccountKey {
  const key = JSON.parse(json) as ServiceAccountKey;
  if (key.type !== "service_account") {
    throw new Error(
      `Invalid key type "${key.type}" — expected "service_account"`,
    );
  }
  if (!key.private_key || !key.client_email) {
    throw new Error(
      "Service account JSON is missing private_key or client_email",
    );
  }
  return key;
}

export async function getServiceAccountAccessToken(
  serviceAccountJson: string,
  subject: string,
  scopes: string[],
): Promise<string> {
  const cacheKey = `${subject}:${scopes.join(",")}`;

  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expires_at - TOKEN_REFRESH_MARGIN_MS) {
    return cached.access_token;
  }

  const key = parseServiceAccountKey(serviceAccountJson);
  const jwt = await createSignedJwt(key, scopes, subject);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Service account token exchange failed: ${response.status} - ${error}`,
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  tokenCache.set(cacheKey, {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });

  console.log(
    `[service-account] Token for ${key.client_email} impersonating ${subject}, expires in ${data.expires_in}s`,
  );

  return data.access_token;
}
