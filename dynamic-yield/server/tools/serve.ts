import { z } from "zod";
import { dyFetch } from "../lib/client.ts";
import { createDyTool } from "../lib/tool.ts";

export const identitySchema = {
  dyid: z
    .string()
    .optional()
    .describe(
      "Value of the _dyid / _dyid_server cookie. Omit to act as a brand-new user.",
    ),
  session: z
    .string()
    .optional()
    .describe("Value of the _dyjsession cookie. Omit to start a new session."),
  activeConsentAccepted: z
    .boolean()
    .optional()
    .describe("Only needed when the site uses active consent."),
};

export const pageSchema = {
  pageType: z
    .enum(["HOMEPAGE", "CATEGORY", "PRODUCT", "CART", "OTHER"])
    .describe("DY page context type."),
  pageData: z
    .array(z.string())
    .default([])
    .describe(
      "PRODUCT: [sku]. CATEGORY: category path, one entry per level. CART: cart SKUs. OTHER: [page id]. HOMEPAGE: [].",
    ),
  location: z.string().url().describe("Full page URL the request simulates."),
  locale: z
    .string()
    .optional()
    .describe('Page locale, e.g. "pt_BR" or "en_US".'),
  referrer: z.string().optional(),
  userAgent: z.string().optional(),
  ip: z.string().optional(),
  channel: z.enum(["WEB", "APP"]).optional(),
};

type Identity = {
  dyid?: string;
  session?: string;
  activeConsentAccepted?: boolean;
};
type Page = {
  pageType: string;
  pageData: string[];
  location: string;
  locale?: string;
  referrer?: string;
  userAgent?: string;
  ip?: string;
  channel?: string;
};

export function buildIdentity(input: Identity) {
  return {
    user: {
      ...(input.dyid && { dyid: input.dyid, dyid_server: input.dyid }),
      ...(input.activeConsentAccepted !== undefined && {
        active_consent_accepted: input.activeConsentAccepted,
      }),
    },
    session: input.session ? { dy: input.session } : {},
  };
}

export function buildContext(
  input: Page & { pageAttributes?: Record<string, string> },
) {
  return {
    page: {
      type: input.pageType,
      data: input.pageData,
      location: input.location,
      ...(input.locale && { locale: input.locale }),
      ...(input.referrer && { referrer: input.referrer }),
    },
    ...((input.userAgent || input.ip) && {
      device: {
        ...(input.userAgent && { userAgent: input.userAgent }),
        ...(input.ip && { ip: input.ip }),
      },
    }),
    ...(input.channel && { channel: input.channel }),
    ...(input.pageAttributes && { pageAttributes: input.pageAttributes }),
  };
}

export const chooseTool = createDyTool({
  id: "DY_CHOOSE",
  description:
    "Run Dynamic Yield's Experience API choose call for one page context and return the chosen variations: campaign payloads, recommendation slots (SKUs and product data), decision ids, analytics metadata and cookies. Use it to QA campaigns and recommendation selectors, including unpublished ones via a preview token. By default it does not count as a pageview.",
  inputSchema: z
    .object({
      selectorNames: z
        .array(z.string())
        .default([])
        .describe("Campaign API selector names to evaluate."),
      selectorGroups: z
        .array(z.string())
        .default([])
        .describe("Selector groups to evaluate."),
      ...identitySchema,
      ...pageSchema,
      pageAttributes: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Real-time targeting/filter attributes (case-sensitive, not stored).",
        ),
      previewToken: z
        .string()
        .optional()
        .describe(
          "Value of the dyApiPreview URL parameter from a DY preview link, to see unpublished variations.",
        ),
      recommendationArgs: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "selector.args passed as-is, e.g. real-time recommendation filters.",
        ),
      skusOnly: z
        .boolean()
        .default(false)
        .describe("Return only SKUs in recommendation slots."),
      productFields: z
        .array(z.string())
        .optional()
        .describe(
          "Restrict recommendation productData to these feed fields. Ignored if skusOnly.",
        ),
      returnAnalyticsMetadata: z.boolean().default(true),
      isImplicitPageview: z
        .boolean()
        .default(false)
        .describe(
          "Also report a pageview. Leave false for QA to avoid polluting analytics.",
        ),
      deduplicateRecommendations: z.boolean().optional(),
    })
    .refine(
      (input) => input.selectorNames.length + input.selectorGroups.length > 0,
      { message: "Provide at least one selector name or group" },
    ),
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: (input, env) =>
    dyFetch(env, "/serve/user/choose", {
      body: {
        ...buildIdentity(input),
        context: buildContext(input),
        selector: {
          names: input.selectorNames,
          ...(input.selectorGroups.length && { groups: input.selectorGroups }),
          ...(input.previewToken && {
            preview: { ids: [input.previewToken] },
          }),
          ...(input.recommendationArgs && { args: input.recommendationArgs }),
        },
        options: {
          isImplicitPageview: input.isImplicitPageview,
          returnAnalyticsMetadata: input.returnAnalyticsMetadata,
          ...(input.deduplicateRecommendations !== undefined && {
            deduplicateRecommendations: input.deduplicateRecommendations,
          }),
          ...(input.skusOnly
            ? { recsProductData: { skusOnly: true } }
            : input.productFields && {
                recsProductData: { fieldFilter: input.productFields },
              }),
        },
      },
    }),
});

export const serveTools = [chooseTool];
