/**
 * GitHub App Authentication
 *
 * Generates a JWT from GITHUB_APP_ID + GITHUB_PRIVATE_KEY,
 * then exchanges it for an installation access token.
 * Used at startup to discover upstream MCP tools.
 */

import crypto from "node:crypto";

const GITHUB_APP_ID = process.env.GITHUB_APP_ID || "";
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY || "";

function base64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

/**
 * Create a JWT signed with the GitHub App's private key (RS256).
 * Valid for 10 minutes (GitHub's maximum).
 */
function createAppJWT(): string {
  if (!GITHUB_APP_ID || !GITHUB_PRIVATE_KEY) {
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
      iss: GITHUB_APP_ID,
    }),
  );

  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(GITHUB_PRIVATE_KEY, "base64url");

  return `${signingInput}.${signature}`;
}

/**
 * Get an installation access token for the GitHub App.
 * Picks the first available installation.
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

  const installationId = installations[0].id;

  // Create installation access token
  const tokenRes = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(
      `Failed to create installation token: ${tokenRes.status} — ${text}`,
    );
  }

  const data = (await tokenRes.json()) as { token: string };
  return data.token;
}
