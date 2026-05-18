/**
 * Microsoft Graph notification validation utilities.
 *
 * Graph sends a GET with ?validationToken=... when creating a subscription.
 * We must echo it back as text/plain within 10 seconds.
 *
 * For incoming notifications, we validate the clientState secret.
 */

import type { GraphNotification } from "./lib/types.ts";

/**
 * Returns true if this is a Graph subscription validation request.
 * (GET request with validationToken query parameter)
 */
export function isValidationRequest(url: URL): boolean {
  return url.searchParams.has("validationToken");
}

/**
 * Extract the validationToken from the URL query string.
 */
export function getValidationToken(url: URL): string {
  return url.searchParams.get("validationToken") ?? "";
}

/**
 * Validate that an incoming notification's clientState matches our secret.
 * Returns false for any notification where clientState is wrong.
 */
export function isValidNotification(
  notification: GraphNotification,
  expectedClientState: string,
): boolean {
  return notification.clientState === expectedClientState;
}
