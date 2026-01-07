import type { Env } from "server/main";

export const getHyperDXApiKey = (env: Env) => {
  const authorization = env.MESH_REQUEST_CONTEXT.authorization;
  console.log("[HyperDX] Authorization header present:", !!authorization);

  if (!authorization) {
    throw new Error(
      "HyperDX API key not provided. Please add your HyperDX API key as the Token in the connection settings.",
    );
  }

  // Strip "Bearer " prefix if present (Mesh sends the token directly)
  const apiKey = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : authorization;

  console.log("[HyperDX] API key length:", apiKey.length);
  return apiKey;
};
