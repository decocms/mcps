import { z } from "zod";
import { dyFetch } from "../lib/client.ts";
import { createDyTool } from "../lib/tool.ts";

export const userProfileTool = createDyTool({
  id: "DY_USER_PROFILE",
  description:
    "Read a user's Dynamic Yield profile through Profile Anywhere, optionally with affinity scores. Requires profileAnywhereKey in the connection configuration.",
  inputSchema: z.object({
    cuid: z.string().min(1).describe("Customer id value."),
    cuidType: z
      .string()
      .default("external")
      .describe(
        'Customer id type, e.g. "external", "he" (hashed email) or "dyid".',
      ),
    affinity: z.boolean().default(true).describe("Include affinity scores."),
  }),
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: ({ cuid, cuidType, affinity }, env) => {
    const apiKey = env.MESH_REQUEST_CONTEXT?.state?.profileAnywhereKey;
    if (!apiKey) {
      throw new Error(
        "profileAnywhereKey is not configured. Add the Profile Anywhere API key to the connection configuration.",
      );
    }
    const query = new URLSearchParams({
      cuid,
      cuidType,
      affinity: String(affinity),
    });
    return dyFetch(env, `/userprofile?${query}`, { method: "GET", apiKey });
  },
});

export const profileTools = [userProfileTool];
