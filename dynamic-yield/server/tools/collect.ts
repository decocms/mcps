import { z } from "zod";
import { dyFetch } from "../lib/client.ts";
import { createDyTool } from "../lib/tool.ts";
import {
  buildContext,
  buildIdentity,
  identitySchema,
  pageSchema,
} from "./serve.ts";

const WRITES_REAL_DATA =
  "This writes real data to the Dynamic Yield site and affects its analytics; use a test user (a dedicated dyid).";

export const trackPageviewTool = createDyTool({
  id: "DY_TRACK_PAGEVIEW",
  description: `Report a pageview to Dynamic Yield for a page context. ${WRITES_REAL_DATA}`,
  inputSchema: z.object({ ...identitySchema, ...pageSchema }),
  annotations: { readOnlyHint: false, openWorldHint: true },
  handler: (input, env) =>
    dyFetch(env, "/collect/user/pageview", {
      body: { ...buildIdentity(input), context: buildContext(input) },
    }),
});

export const trackEventsTool = createDyTool({
  id: "DY_TRACK_EVENTS",
  description: `Report events to Dynamic Yield (add-to-cart, purchase, remove-from-cart, sync-cart, identify, login, signup, newsletter or custom events). ${WRITES_REAL_DATA}`,
  inputSchema: z.object({
    ...identitySchema,
    events: z
      .array(
        z.object({
          name: z.string().describe('Event name, e.g. "Add to Cart".'),
          properties: z
            .record(z.string(), z.unknown())
            .default({})
            .describe(
              'Event properties. Predefined events need dyType, e.g. {"dyType":"add-to-cart-v1","value":10,"currency":"BRL","productId":"sku-1","quantity":1,"cart":[...]}. Purchases should set uniqueTransactionId.',
            ),
        }),
      )
      .min(1),
  }),
  annotations: { readOnlyHint: false, openWorldHint: true },
  handler: (input, env) =>
    dyFetch(env, "/collect/user/event", {
      body: { ...buildIdentity(input), events: input.events },
    }),
});

const variations = z
  .array(z.number().int())
  .optional()
  .describe("Variation ids from the choose response.");

export const trackEngagementTool = createDyTool({
  id: "DY_TRACK_ENGAGEMENT",
  description: `Report engagement with a choose result: CLICK or IMP on a decisionId, or SLOT_CLICK on a recommendation slotId. ${WRITES_REAL_DATA}`,
  inputSchema: z.object({
    ...identitySchema,
    engagements: z
      .array(
        z.discriminatedUnion("type", [
          z.object({
            type: z.enum(["CLICK", "IMP"]),
            decisionId: z.string(),
            variations,
          }),
          z.object({
            type: z.literal("SLOT_CLICK"),
            slotId: z.string(),
            variations,
          }),
        ]),
      )
      .min(1),
  }),
  annotations: { readOnlyHint: false, openWorldHint: true },
  handler: (input, env) =>
    dyFetch(env, "/collect/user/engagement", {
      body: { ...buildIdentity(input), engagements: input.engagements },
    }),
});

export const collectTools = [
  trackPageviewTool,
  trackEventsTool,
  trackEngagementTool,
];
