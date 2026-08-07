/**
 * Shared authentication middleware for MCP servers.
 *
 * Every MCP in this monorepo is reachable from the public internet (for
 * example `https://sites-<name>.decocache.com/mcp`). The runtime itself does
 * not authenticate the transport: `withRuntime` serves both the MCP endpoint
 * and `POST /mcp/call-tool/<toolId>` to anyone who can resolve the hostname.
 * `createPrivateTool` only asserts that *some* `x-mesh-token` JWT is present —
 * the runtime decodes it with `decodeJwt`, it never verifies the signature.
 *
 * `withAuth` closes that gap at the process edge, before any tool, prompt or
 * resource runs:
 *
 *   - it reads a shared secret from `AUTH_TOKEN` at startup and refuses to
 *     build the handler when that variable is missing, so a misconfigured MCP
 *     fails to boot instead of silently serving anonymous traffic;
 *   - it compares the presented credential in constant time;
 *   - it answers `401` with a `WWW-Authenticate` challenge on any mismatch.
 *
 * Usage (see `template-minimal/server/main.ts`):
 *
 * ```ts
 * import { serve } from "@decocms/mcps-shared/serve";
 * import { withAuth } from "@decocms/mcps-shared/auth";
 *
 * serve(withAuth(runtime.fetch));
 * ```
 */

import { createHash, timingSafeEqual } from "node:crypto";

// Matches the fetcher shape accepted by `serve`: runtime.fetch takes
// (req, env, ctx), plain handlers take (req).
// biome-ignore lint/suspicious/noExplicitAny: compatibility with runtime.fetch
type Fetcher = (req: Request, ...args: any[]) => Response | Promise<Response>;

/** Name of the environment variable holding the shared secret. */
export const AUTH_TOKEN_ENV = "AUTH_TOKEN";

/**
 * Minimum accepted secret length. Long enough to rule out placeholders like
 * "changeme" or "test" being promoted to production by accident.
 */
export const MIN_AUTH_TOKEN_LENGTH = 24;

/**
 * Paths that must stay reachable without credentials.
 *
 * `/_healthcheck` is probed by the Kubernetes readiness/liveness probes, which
 * do not carry an Authorization header. It is answered by the runtime before
 * any user code and leaks nothing.
 */
const ALWAYS_PUBLIC_PATHS = ["/_healthcheck"];

export interface WithAuthOptions {
  /**
   * Header carrying the credential. Defaults to `authorization`, which is what
   * Mesh forwards for connections declaring `auth.type: "token"` in app.json.
   *
   * Override this when the MCP already uses `Authorization` for a *per
   * connection upstream credential* (a user's Strapi/Slack/VTEX key). In that
   * case the shared secret needs its own header, e.g. `x-deco-mcp-auth`, and
   * the caller has to be configured to send it.
   */
  header?: string;

  /**
   * Extra unauthenticated paths — OAuth callbacks and provider webhooks, which
   * are called by third parties that cannot present the secret. Matched by
   * exact path or by prefix when the entry ends with `*`.
   *
   * Anything listed here is public. Each entry must carry its own protection
   * (state parameter, webhook signature, `?token=` query secret).
   */
  publicPaths?: string[];

  /**
   * Environment to read the secret from. Defaults to `process.env`. Only
   * useful for tests and for platforms that pass env per request.
   */
  env?: Record<string, string | undefined>;
}

/**
 * Reads and validates the shared secret.
 *
 * @throws when the variable is unset, blank, or shorter than
 * {@link MIN_AUTH_TOKEN_LENGTH}. Callers are expected to let this propagate:
 * an MCP with no secret must not start.
 */
export function readAuthToken(
  env: Record<string, string | undefined> = process.env,
): string {
  const token = env[AUTH_TOKEN_ENV]?.trim();

  if (!token) {
    throw new Error(
      `[auth] ${AUTH_TOKEN_ENV} is not set. This MCP is served on a public ` +
        `hostname and refuses to start without a shared secret.\n` +
        `  local:      add ${AUTH_TOKEN_ENV}=<secret> to .env (see .env.example)\n` +
        `  kubernetes: add it to the site state secret\n` +
        `  workers:    bunx wrangler secret put ${AUTH_TOKEN_ENV}\n` +
        `  generate:   openssl rand -hex 32`,
    );
  }

  if (token.length < MIN_AUTH_TOKEN_LENGTH) {
    throw new Error(
      `[auth] ${AUTH_TOKEN_ENV} is too short (${token.length} chars, ` +
        `minimum ${MIN_AUTH_TOKEN_LENGTH}). Generate one with: openssl rand -hex 32`,
    );
  }

  return token;
}

/**
 * Constant-time string comparison.
 *
 * Both sides are hashed first so `timingSafeEqual` always receives equal-length
 * buffers — comparing the raw strings would throw on length mismatch and leak
 * the secret's length through the error path.
 */
function secureEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/** Strips an optional `Bearer ` prefix from a header value. */
function stripBearer(value: string): string {
  const trimmed = value.trim();
  return trimmed.toLowerCase().startsWith("bearer ")
    ? trimmed.slice(7).trim()
    : trimmed;
}

function isPublicPath(pathname: string, publicPaths: string[]): boolean {
  return publicPaths.some((entry) =>
    entry.endsWith("*")
      ? pathname.startsWith(entry.slice(0, -1))
      : pathname === entry,
  );
}

function unauthorized(reason: string): Response {
  return new Response(JSON.stringify({ error: "unauthorized", reason }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": 'Bearer realm="mcp"',
    },
  });
}

/**
 * Wraps a fetch handler so every request carries the shared secret.
 *
 * The secret is read eagerly: calling `withAuth` without a valid
 * {@link AUTH_TOKEN_ENV} throws at module load, which is what makes this
 * fail-closed rather than fail-open.
 */
export function withAuth(
  fetcher: Fetcher,
  options: WithAuthOptions = {},
): Fetcher {
  const {
    header = "authorization",
    publicPaths = [],
    env = process.env,
  } = options;

  // Eager: an MCP without a secret must fail to boot, not on first request.
  const expected = readAuthToken(env);
  const headerName = header.toLowerCase();
  const allowlist = [...ALWAYS_PUBLIC_PATHS, ...publicPaths];

  return async (req: Request, ...args) => {
    const { pathname } = new URL(req.url);

    // CORS preflight never carries credentials; the runtime answers it and
    // the browser replays the real request, which is checked below.
    if (req.method === "OPTIONS" || isPublicPath(pathname, allowlist)) {
      return fetcher(req, ...args);
    }

    const presented = req.headers.get(headerName);

    if (!presented) {
      return unauthorized(`missing ${headerName} header`);
    }

    if (!secureEquals(stripBearer(presented), expected)) {
      return unauthorized("invalid token");
    }

    return fetcher(req, ...args);
  };
}
