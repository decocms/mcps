import type { Env } from "../main.ts";

export const getFluxApiKey = (env: Env): string => {
  const apiKey = env.MESH_REQUEST_CONTEXT?.state?.BFL_API_KEY;

  if (!apiKey) {
    throw new Error("Missing BFL_API_KEY. Configure it in the MCP settings.");
  }

  return apiKey;
};
