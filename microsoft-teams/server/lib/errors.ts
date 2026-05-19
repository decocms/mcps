/**
 * Centralized error formatting for tool error responses.
 *
 * Microsoft Graph returns errors as JSON with a stable shape:
 *   { "error": { "code": "Forbidden", "message": "...", "innerError": {...} } }
 *
 * Our raw catches throw `Error("Graph API error 403 https://...: <body>")`.
 * `formatToolError` parses that, extracts the relevant fields, and adds an
 * actionable hint when the code matches a known pattern.
 */

export interface FormattedError {
  /** Human-readable single-line message. */
  message: string;
  /** Machine-readable code — e.g. "Forbidden", "Unauthorized", "NotFound". */
  code: string;
  /** Optional next-step suggestion (what should the agent/user do?). */
  hint?: string;
  /** Microsoft request-id from innerError (when present) — useful for support. */
  request_id?: string;
  /** HTTP status when known. */
  status?: number;
}

/**
 * Hints keyed by Graph error code (or substring match on the message).
 * Order matters — earlier entries win.
 */
const HINTS: Array<{
  match: (code: string, message: string, status?: number) => boolean;
  hint: string;
}> = [
  // Personal Microsoft account on a Teams business API
  {
    match: (_c, m) =>
      m.includes("not supported for MSA") ||
      m.includes("license information for the user"),
    hint: "Microsoft Teams APIs require a work or school account (Microsoft 365) with a valid Teams license. Personal accounts are not supported.",
  },
  // Subscription expired / invalid
  {
    match: (_c, m) =>
      m.includes("Subscription not found") ||
      m.includes("Subscription is no longer valid"),
    hint: "The Graph subscription has expired or been removed. Invoke REFRESH_SUBSCRIPTIONS to renew it, or SUBSCRIBE_TO_CHANNEL to create a new one.",
  },
  // Missing scope
  {
    match: (_c, m) =>
      m.includes("Missing scope") ||
      m.includes("scope permissions") ||
      m.includes("ScopeUnauthorized") ||
      m.includes("does not have permission"),
    hint: "Required permission scope is missing. Add the Delegated permission in the Azure portal (with admin consent), then reconnect the Microsoft Teams integration in deco Studio.",
  },
  // Authentication — invalid or expired token
  {
    match: (c, _m, s) =>
      c === "Unauthorized" || c === "InvalidAuthenticationToken" || s === 401,
    hint: "Access token is missing, expired, or invalid. Reconnect the Microsoft Teams integration in deco Studio.",
  },
  // Rate limit
  {
    match: (c, _m, s) => c === "TooManyRequests" || s === 429,
    hint: "Microsoft Graph is rate-limiting requests. Back off for a few seconds and respect the Retry-After header before retrying.",
  },
  // Resource not found
  {
    match: (c, _m, s) => c === "NotFound" || s === 404,
    hint: "Resource not found. Verify the identifiers (team_id, channel_id, message_id, chat_id) and that the user has access.",
  },
  // Generic Forbidden
  {
    match: (c, _m, s) => c === "Forbidden" || s === 403,
    hint: "Microsoft Graph denied the request. Check API permissions, admin consent, and the user's Microsoft 365 / Teams licensing.",
  },
  // Bad request — usually malformed IDs or missing required fields
  {
    match: (c, _m, s) => c === "BadRequest" || s === 400,
    hint: "Microsoft Graph rejected the request payload. Validate that all required identifiers are present and well-formed (GUIDs, channel/chat IDs, etc.).",
  },
];

function pickHint(
  code: string,
  message: string,
  status?: number,
): string | undefined {
  for (const h of HINTS) {
    if (h.match(code, message, status)) return h.hint;
  }
  return undefined;
}

/**
 * Parse an unknown thrown value (usually an Error from our graph-client) into
 * a structured tool error response.
 */
export function formatToolError(err: unknown): FormattedError {
  // Webhook-token cache miss — our auth.ts message
  const raw = err instanceof Error ? err.message : String(err);

  // Our graph-client throws: `Graph API error <status> <url>: <body>`
  // Body always starts with `{` so we anchor on `: {` to skip past the
  // colons inside the URL (https://...).
  const graphMatch = raw.match(/Graph API error (\d+) .+?: (\{[\s\S]+)$/);
  if (graphMatch) {
    const status = Number(graphMatch[1]);
    const body = graphMatch[2];
    try {
      const parsed = JSON.parse(body) as {
        error?: {
          code?: string;
          message?: string;
          innerError?: { "request-id"?: string };
        };
      };
      const code = parsed.error?.code ?? "GraphError";
      const message = parsed.error?.message ?? raw;
      const request_id = parsed.error?.innerError?.["request-id"];
      return {
        message,
        code,
        hint: pickHint(code, message, status),
        request_id,
        status,
      };
    } catch {
      return {
        message: body,
        code: "GraphError",
        status,
        hint: pickHint("GraphError", body, status),
      };
    }
  }

  // Auth-cache misses (thrown by getDelegatedTokenForConnection / getAccessToken)
  if (raw.includes("No cached webhook token")) {
    return {
      message: raw,
      code: "WebhookTokenMissing",
      hint: "No delegated token is cached. Invoke SUBSCRIBE_TO_CHANNEL to seed the cache, then retry.",
    };
  }
  if (raw.includes("Webhook token") && raw.includes("expired")) {
    return {
      message: raw,
      code: "WebhookTokenExpired",
      hint: "Cached delegated token has expired. Invoke REFRESH_SUBSCRIPTIONS to renew it.",
    };
  }
  if (
    raw.includes("Missing authorization") ||
    raw.includes("Connect to Microsoft")
  ) {
    return {
      message: raw,
      code: "Unauthenticated",
      hint: "Authentication required. Complete the 'Connect to Microsoft' flow in deco Studio.",
    };
  }

  // Generic fallback
  return {
    message: raw,
    code: "UnknownError",
    hint: undefined,
  };
}

/**
 * Convenience: shape a standardized error object the tools can return.
 * Keeps backwards compatibility by including the `error` string field.
 */
export function toErrorResponse(err: unknown): {
  success: false;
  error: string;
  error_code: string;
  error_hint: string | null;
  request_id: string | null;
} {
  const f = formatToolError(err);
  return {
    success: false,
    error: f.hint
      ? `[${f.code}] ${f.message} — ${f.hint}`
      : `[${f.code}] ${f.message}`,
    error_code: f.code,
    error_hint: f.hint ?? null,
    request_id: f.request_id ?? null,
  };
}
