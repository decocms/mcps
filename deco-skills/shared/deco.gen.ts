// Generated types - do not edit manually

import { z } from "zod";

export const StateSchema = z.object({
  enabledSkills: z
    .array(z.string())
    .default([
      "decocms-marketing-pages",
      "deco-brand-guidelines",
      "deco-product-positioning",
      "decocms-blog-posts",
      "deco-writing-style",
    ])
    .describe("Select which skills to enable"),
});

export interface Env {
  DECO_CHAT_WORKSPACE: string;
  DECO_CHAT_API_JWT_PUBLIC_KEY: string;
}
