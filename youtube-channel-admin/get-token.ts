/**
 * Generates a Google OAuth access token via the local MCP server PKCE flow.
 * Usage: bun run get-token.ts
 *
 * Requires the MCP server running: PORT=8003 bun run dev:api
 */
import { createHash, randomBytes } from "crypto";

const MCP_BASE = "http://localhost:8003";
const CALLBACK_PORT = 8099;

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function generatePKCE() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(
    Buffer.from(createHash("sha256").update(verifier).digest()),
  );
  return { verifier, challenge };
}

async function captureCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = Bun.serve({
      port: CALLBACK_PORT,
      fetch(req) {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        server.stop();
        if (error) {
          reject(
            new Error(
              `OAuth error: ${error} — ${url.searchParams.get("error_description") ?? ""}`,
            ),
          );
          return new Response("Error: " + error, { status: 400 });
        }
        if (!code) {
          reject(new Error("No code in callback"));
          return new Response("No code", { status: 400 });
        }
        resolve(code);
        return new Response(
          "<script>window.close()</script>✅ Autorizado! Pode fechar esta aba.",
        );
      },
    });
    console.log(`Callback server listening on :${CALLBACK_PORT}`);
  });
}

async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch(`${MCP_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: `http://localhost:${CALLBACK_PORT}/callback`,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

const { verifier, challenge } = generatePKCE();
const state = base64url(randomBytes(8));
const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`;

const authorizeUrl = new URL(`${MCP_BASE}/authorize`);
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("client_id", "local-test");
authorizeUrl.searchParams.set("redirect_uri", redirectUri);
authorizeUrl.searchParams.set("code_challenge", challenge);
authorizeUrl.searchParams.set("code_challenge_method", "S256");
authorizeUrl.searchParams.set("state", state);

console.log("\n🔗 Abre este link no browser para autorizar:\n");
console.log(authorizeUrl.toString());
console.log("\nAguardando callback...\n");

// Open browser automatically (macOS)
Bun.spawn(["open", authorizeUrl.toString()]);

const code = await captureCode();
const token = await exchangeCode(code, verifier);

console.log("\n✅ Access token:\n");
console.log(token);
console.log("\n💡 Para usar:\n");
console.log(`export GTOKEN="${token}"`);
console.log(`\ncurl -s -X POST http://localhost:8003/mcp \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -H "Accept: application/json, text/event-stream" \\`);
console.log(`  -H "Authorization: Bearer $GTOKEN" \\`);
console.log(
  `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"YOUTUBE_ADMIN_GET_MY_CHANNEL","arguments":{}}}' \\`,
);
console.log(
  `  | sed 's/^data: //' | grep -v '^event:' | grep -v '^$' | jq '.result.content[0].text | fromjson'`,
);
