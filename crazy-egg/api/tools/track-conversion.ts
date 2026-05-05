import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { CRAZY_EGG_RESOURCE_URI } from "../constants.ts";
import { trackConversion } from "../lib/client.ts";
import { getTrackingKey } from "../lib/env.ts";
import type { Env } from "../types/env.ts";

const conversionEventSchema = z.object({
  goalName: z
    .string()
    .describe("Name of the conversion goal as configured in Crazy Egg."),
  userIdentifier: z
    .string()
    .describe(
      "Stable user identifier (email, hashed user id, or visitor cookie value).",
    ),
  url: z.string().optional().describe("URL where the conversion happened."),
  value: z.number().optional().describe("Monetary value of the conversion."),
  currency: z
    .string()
    .optional()
    .describe("ISO-4217 currency code (e.g. USD, BRL)."),
  visitCount: z
    .number()
    .optional()
    .describe("How many visits the user made before converting."),
  landingPage: z.string().optional(),
  referrer: z.string().optional(),
  country: z.string().optional(),
  userAgent: z.string().optional(),
  timestamp: z
    .string()
    .optional()
    .describe("ISO-8601 timestamp; defaults to server time when omitted."),
  utmParams: z
    .record(z.string(), z.string())
    .optional()
    .describe("UTM parameters captured at conversion time."),
  customData: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Free-form metadata for downstream analytics."),
});

const inputSchema = conversionEventSchema;

const outputSchema = z.looseObject({
  success: z.boolean().optional(),
  processed: z.number().optional(),
});

export const trackConversionTool = (_env: Env) =>
  createTool({
    id: "crazy_egg_track_conversion",
    description:
      "Record a goal conversion in Crazy Egg via the public Conversion Tracking API. Stable, officially documented endpoint. Requires CRAZY_EGG_TRACKING_KEY (per-site key from Site Settings → API).",
    inputSchema,
    outputSchema,
    _meta: { ui: { resourceUri: CRAZY_EGG_RESOURCE_URI } },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async ({ context, runtimeContext }) => {
      const trackingKey = getTrackingKey(runtimeContext.env as Env);
      const result = await trackConversion({
        trackingKey,
        conversions: [context],
      });
      return {
        success: result.success,
        processed: result.processed,
      };
    },
  });
