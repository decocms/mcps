# GitHub MCP — Synthetic OAuth refresh flow for `MINT_REPO_TOKEN`

**Date:** 2026-06-10
**MCP:** `github/` (Cloudflare Workers deploy, custom domain `github-mcp.decocms.com`)
**Status:** Approved design — ready for implementation planning

## Problem

GitHub installation access tokens (`ghs_…`) are short-lived (~1h) and GitHub
issues **no** refresh token for them. Today, refreshing means calling
`MINT_REPO_TOKEN` again, which requires the caller's broad GitHub
user-to-server token to be present every time. We want the mesh to renew a
repo-scoped `ghs_` token through a normal OAuth refresh path, using only
durable App credentials — no user-to-server token at refresh time.

## Solution summary

Make `MINT_REPO_TOKEN` do two things: mint the first `ghs_` token **and** issue
a durable, revocable **synthetic refresh token** (an MCP-issued repo grant — not
a GitHub-issued refresh token). A new unauthenticated endpoint redeems that
grant by signing a fresh GitHub App JWT and re-minting a repo-scoped
installation token. A second endpoint revokes a grant.

This is explicitly **not** a GitHub refresh token. It is an opaque MCP repo
grant redeemed through OAuth-compatible request/response shapes.

### Flow

```
MINT_REPO_TOKEN (auth: caller's user-to-server token)
  1. verify caller entitlement      (unchanged: GET /user/installations + .../repositories)
  2. mint ghs_                       (existing: repository_ids:[id] + capped perms)
  3. create grant in REPO_GRANTS KV  (NEW: grantId + secretHash, TTL 90d)
  4. return { token, expiresAt, …, refreshToken, tokenEndpoint, clientId, … }

POST /repo-grant/token  (auth: the opaque refresh_token itself; NO user token)
  1. parse ghr_<grantId>.<secret> → KV get grant:<grantId> → constant-time verify secret
  2. check not revoked / not expired
  3. sign App JWT → POST /app/installations/:id/access_tokens {repository_ids:[id], permissions}
  4. slide TTL +90d
  5. return OAuth { access_token, token_type:"Bearer", expires_in, refresh_token (same), scope }

POST /repo-grant/revoke (RFC 7009) → mark + delete grant → 200 (always)
```

## Decisions (locked)

1. **Storage:** dedicated `REPO_GRANTS` KV namespace (not reusing `INSTALLATIONS`).
2. **Refresh token:** **stable** — same `refreshToken` for the life of the grant.
   Redemption only re-mints `ghs_` and slides the TTL; the secret never rotates.
3. **Lifetime:** **sliding 90-day TTL** — every successful refresh extends expiry;
   `refreshTokenExpiresAt` reflects the current expiry. KV `expirationTtl` also set
   so orphaned grants self-expire without explicit revocation.
4. **Revocation:** RFC 7009-style `POST /repo-grant/revoke` endpoint.
5. **Endpoint paths:** namespaced under `/repo-grant/*`, NOT `/oauth/*`. The deco
   runtime owns `/oauth/start`, `/oauth/callback`, `/oauth/logout` for the MCP's own
   mesh-connection auth, and `main.ts`'s `handle()` interceptor runs before
   `runtime.fetch`; staying out of `/oauth/*` is collision-proof. The mesh consumes
   the absolute `tokenEndpoint` we return, so the path is our choice.
6. **`client_id`:** validated against `GITHUB_CLIENT_ID` *if present*, but not
   required — the 256-bit grant secret is the real credential. `client_secret`/`scope`
   are accepted and ignored.

## Component design

### Grant storage — `REPO_GRANTS` KV

- New `[[kv_namespaces]] binding = "REPO_GRANTS"` in `wrangler.toml` (id created via
  `bunx wrangler kv namespace create REPO_GRANTS`, pasted in like `INSTALLATIONS`).
- Key: `grant:<grantId>` → JSON metadata, written with `expirationTtl` = 90d.
- Refresh token shape: `ghr_<grantId>.<secret>`
  - `grantId` = 16 random bytes, hex (lookup key; no `.`).
  - `secret` = 32 random bytes, base64url (256-bit). Returned once, never stored.
  - Stored `secretHash` = `sha256(secret)` (hex); verified with constant-time compare
    (`crypto.timingSafeEqual` over equal-length hex buffers).
- Stored metadata:
  ```ts
  {
    grantId: string;
    secretHash: string;
    installationId: number;
    repositoryId: number;            // resolved at mint; rename-proof
    owner: string;
    repo: string;
    permissions: Record<string, string>;
    createdAt: string;               // ISO
    expiresAt: string | null;        // ISO, sliding 90d
    revokedAt?: string | null;
    createdByConnectionId?: string;  // audit, from MESH_REQUEST_CONTEXT.connectionId
    clientId: string;                // GITHUB_CLIENT_ID at creation
  }
  ```
- Implemented as `KvRepoGrantStore` (+ `MemoryRepoGrantStore` dev fallback), mirroring
  `installation-map.ts`. KV binding threaded per-request (same approach as
  `setTriggerKV`).

### `MINT_REPO_TOKEN` changes (backward compatible)

**Input** — add optional `repositoryId?: number`. The security gate is unchanged:
it resolves the numeric id from the caller's own installation view, which *is* the
entitlement check. If `repositoryId` is supplied, it is cross-checked against the
resolved id and rejected on mismatch (`invalid_input`); the resolved id stays
authoritative and is what gets stored/minted.

**Output** — additive only. Keep `token`, `expiresAt`, `permissions`, `repository`,
`installationId`. Add:

```ts
{
  expiresIn?: number;                 // seconds, derived from expiresAt
  tokenType?: "Bearer";
  refreshToken: string;               // ghr_<grantId>.<secret>
  tokenEndpoint: string;              // ${PUBLIC_BASE_URL}/repo-grant/token
  clientId: string;                   // GITHUB_CLIENT_ID
  refreshTokenExpiresAt?: string | null;
  repository: { id?: number; owner: string; name: string };  // id added
}
```

Existing consumers that read only `token`/`expiresAt` keep working. Every call mints
a fresh token **and** a fresh grant; proliferation from legacy repeated calls is
bounded by the 90-day TTL (new mesh calls `MINT_REPO_TOKEN` once, then refreshes via
the endpoint).

### `POST /repo-grant/token`

Form-encoded (`application/x-www-form-urlencoded`):
`grant_type=refresh_token&refresh_token=…&client_id=…[&client_secret=…&scope=…]`.

| Condition | Response |
|---|---|
| Success | `200` `{access_token, token_type:"Bearer", expires_in, refresh_token (same), scope}` |
| Unknown / revoked / expired grant, bad secret, unparseable `refresh_token` value | `400 invalid_grant` — **permanent** |
| Missing `grant_type` or missing `refresh_token` param | `400 invalid_request` |
| `grant_type` present but ≠ `refresh_token` | `400 unsupported_grant_type` |
| `client_id` present and ≠ `GITHUB_CLIENT_ID` | `400 invalid_client` |
| GitHub 422 (repo not in install / perms exceed) or 404 (install gone) | `400 invalid_grant` + delete grant — **permanent** |
| GitHub 5xx / 429 / 403-ratelimit, KV unavailable, App-auth/config error | `503` / `429` `temporarily_unavailable` — **transient** |

`scope` in the success body is informational, e.g.
`github-app-installation:<installationId> repo:<owner>/<repo>`.

Critical invariant: a server misconfiguration (bad App key → GitHub 401/403) returns
a **transient 503**, never `invalid_grant` — we never tell the mesh to discard a valid
grant over our own fault. Error bodies are RFC 6749 §5.2 shaped
(`{error, error_description}`).

### `POST /repo-grant/revoke` (RFC 7009)

Form-encoded `token=<refresh_token>[&token_type_hint=…]`. Parse → if grant found, set
`revokedAt` and delete. Always return `200` (even for unknown/malformed tokens, per
RFC 7009, to avoid leaking validity). KV unavailable → `503`.

### Public endpoint URL

`tokenEndpoint = ${PUBLIC_BASE_URL}/repo-grant/token`, where `PUBLIC_BASE_URL` is a
new optional env var defaulting to `https://github-mcp.decocms.com` (matches the
`wrangler.toml` custom-domain route). `clientId = GITHUB_CLIENT_ID`.

## Files

**New**
- `lib/repo-grant-store.ts` — KV store (`KvRepoGrantStore` / `MemoryRepoGrantStore`),
  token format/parse, secret gen, hash, constant-time verify.
- `lib/repo-grant.ts` — pure-ish token + revoke handler logic returning
  `{status, headers, body}`; maps GitHub/KV failures to permanent vs transient.
- `constants.ts` — `DEFAULT_PUBLIC_BASE_URL`, `GRANT_TTL_SECONDS`, endpoint paths,
  KV prefix.

**Changed**
- `tools/mint-repo-token.ts` — extend input/output schemas; create grant after mint.
- `lib/repo-token.ts` — return resolved `repositoryId`; cross-check provided id.
- `types/env.ts` — add `REPO_GRANTS?: KVNamespace`, `PUBLIC_BASE_URL?: string`.
- `main.ts` — route `POST /repo-grant/token` and `/repo-grant/revoke` (before
  `runtime.fetch`); thread `env.REPO_GRANTS` into the store.
- `wrangler.toml` — add `REPO_GRANTS` KV namespace (+ optional `PUBLIC_BASE_URL` var).

**Tests** (`bun:test`, global-`fetch` mock, mirroring `repo-token.test.ts`)
- `repo-grant-store.test.ts` — token format/parse, hash + constant-time verify,
  create/get/touch-extends-ttl/revoke (memory impl).
- `repo-grant.test.ts` — refresh: success → OAuth shape; unknown/revoked/expired/
  bad-secret → 400 invalid_grant; GitHub 422/404 → 400 invalid_grant + delete; GitHub
  5xx/429 → 503/429; missing grant_type → 400; client_id mismatch → 400 invalid_client;
  revoke known → 200 + gone, unknown → 200.
- extend `repo-token.test.ts` — `repositoryId` cross-check + new output fields.

## Out of scope (YAGNI)

- Refresh-token rotation; self-contained signed/encrypted tokens; per-grant client
  secrets; `/.well-known` discovery doc.
- Re-verifying the user's entitlement at refresh time — **by design**, refresh uses
  only App credentials + the stored grant. GitHub's own 422/404 covers "app lost
  access" / "repo gone".

## Acceptance criteria

- `MINT_REPO_TOKEN` still returns a valid short-lived `ghs_` token (existing fields intact).
- `MINT_REPO_TOKEN` additionally returns `refreshToken`, `tokenEndpoint`, `clientId`.
- `POST {tokenEndpoint}` with `grant_type=refresh_token` returns a fresh `ghs_` token
  scoped to the same installation/repo/permissions.
- No user-to-server OAuth token is required during refresh.
- Invalid/revoked grants → `400 invalid_grant`; transient failures never return
  `invalid_grant`.
- Existing consumers of `MINT_REPO_TOKEN` remain compatible.
- `POST /repo-grant/revoke` invalidates a grant; subsequent refresh → `400 invalid_grant`.
