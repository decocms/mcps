/**
 * Global Server Configuration
 *
 * Stores runtime server configuration like base URL
 */

let serverBaseUrl = "http://localhost:3003"; // Default for local dev

/**
 * Set the server base URL (called on startup)
 */
export function setServerBaseUrl(url: string): void {
  serverBaseUrl = url;
  console.log(`[ServerConfig] Base URL set to: ${url}`);
}

/**
 * Get the current server base URL
 */
export function getServerBaseUrl(): string {
  return serverBaseUrl;
}
