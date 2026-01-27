/**
 * API Key Manager
 *
 * Manages persistent API Keys for long-running MCP operations.
 * The Mesh JWT token expires in 5 minutes, but persistent connections
 * (like Discord websocket or Slack webhooks) need to stay active
 * indefinitely. This module creates a persistent API Key using the
 * temporary JWT, which can then be used for all subsequent LLM/DB calls.
 */

// Store the persistent API key per connection
const persistentApiKeys = new Map<string, string>();

/**
 * Get or create a persistent API Key for this connection.
 *
 * Uses the temporary JWT token (valid for 5 minutes) to create
 * a long-lived API Key that won't expire.
 */
export async function getOrCreatePersistentApiKey(params: {
  meshUrl: string;
  organizationId: string;
  connectionId: string;
  temporaryToken: string;
}): Promise<string | null> {
  const { meshUrl, connectionId, temporaryToken } = params;

  // If we already have an API key for this connection, return it
  const existingKey = persistentApiKeys.get(connectionId);
  if (existingKey) {
    console.log(
      `[API-KEY] Using existing persistent API Key for ${connectionId}`,
    );
    return existingKey;
  }

  console.log(
    `[API-KEY] Creating new persistent API Key for ${connectionId}...`,
  );

  try {
    // Use localhost for tunnel URLs (server-to-server communication)
    const isTunnel = meshUrl.includes(".deco.host");
    const effectiveMeshUrl = isTunnel ? "http://localhost:3000" : meshUrl;

    // Create API Key via Mesh Self MCP endpoint (JSON-RPC)
    // Accept: application/json MUST be first to get JSON response (not SSE)
    console.log(`[API-KEY] Calling ${effectiveMeshUrl}/mcp/self`);
    const response = await fetch(`${effectiveMeshUrl}/mcp/self`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${temporaryToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "API_KEY_CREATE",
          arguments: {
            name: `mcp-${connectionId}-${Date.now()}`,
            permissions: {
              // Grant full access to this connection and self management
              self: ["*"],
              [connectionId]: ["*"],
            },
            // No expiresIn = never expires
            metadata: {
              purpose: "mcp-persistent",
              connectionId,
              createdAt: new Date().toISOString(),
            },
          },
        },
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[API-KEY] ❌ Failed to create API Key: ${response.status}`,
        errorText,
      );
      console.error(`[API-KEY] URL used: ${effectiveMeshUrl}/mcp/self`);
      return null;
    }

    const responseText = await response.text();
    console.log(
      `[API-KEY] Raw response (first 500 chars):`,
      responseText.substring(0, 500),
    );

    // MCP JSON-RPC response format
    let jsonRpcResult: {
      result?: {
        content?: Array<{ type: string; text?: string }>;
        structuredContent?: {
          id?: string;
          name?: string;
          key?: string;
        };
      };
      error?: { code: number; message: string };
    };

    try {
      jsonRpcResult = JSON.parse(responseText);
    } catch (parseError) {
      console.error(
        `[API-KEY] ❌ Failed to parse response as JSON:`,
        parseError,
      );
      return null;
    }

    if (jsonRpcResult.error) {
      console.error("[API-KEY] API error:", jsonRpcResult.error.message);
      return null;
    }

    // Extract API key from structuredContent (MCP tool response format)
    const apiKey = jsonRpcResult.result?.structuredContent?.key;

    if (apiKey) {
      persistentApiKeys.set(connectionId, apiKey);
      console.log(
        `[API-KEY] ✅ Persistent API Key created for ${connectionId}`,
      );
      return apiKey;
    }

    // Try parsing from content array if structuredContent not present
    const textContent = jsonRpcResult.result?.content?.find(
      (c) => c.type === "text",
    );
    if (textContent?.text) {
      try {
        const parsed = JSON.parse(textContent.text);
        if (parsed.key) {
          persistentApiKeys.set(connectionId, parsed.key);
          console.log(
            `[API-KEY] ✅ Persistent API Key created for ${connectionId}`,
          );
          return parsed.key;
        }
      } catch {
        // Not JSON, ignore
      }
    }

    console.error(
      "[API-KEY] Could not extract API key from response:",
      jsonRpcResult,
    );
    return null;
  } catch (error) {
    console.error(
      "[API-KEY] Error creating API Key:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Get the persistent API Key for a connection (if available)
 */
export function getPersistentApiKey(connectionId: string): string | null {
  return persistentApiKeys.get(connectionId) ?? null;
}

/**
 * Clear the stored API Key for a connection
 */
export function clearPersistentApiKey(connectionId: string): void {
  persistentApiKeys.delete(connectionId);
  console.log(`[API-KEY] Cleared persistent API Key for ${connectionId}`);
}

/**
 * Check if we have a persistent API Key for a connection
 */
export function hasPersistentApiKey(connectionId: string): boolean {
  return persistentApiKeys.has(connectionId);
}
