import type { Env } from "../types/env.ts";

/**
 * Get Discord Bot Token from Authorization header
 * The token is used directly as the Discord Bot Token
 *
 * @param env - The environment containing the mesh request context
 * @returns The Discord Bot Token to use for authentication
 * @throws Error with 401 status if not authenticated
 */
export const getDiscordBotToken = (env: Env): string => {
  const authorization = env.MESH_REQUEST_CONTEXT?.authorization;

  if (!authorization) {
    throw new Error("Unauthorized: Missing authorization header");
  }

  // Extract token from "Bearer <token>" format
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : authorization;

  if (!token) {
    throw new Error("Unauthorized: Invalid authorization format");
  }

  // Use the token directly as the Discord Bot Token
  return token;
};
