import { z } from "zod";

/**
 * Curated parameter descriptions, applied on top of each tool's input schema.
 *
 * Why this exists: the generated Zod schemas are produced with
 * `metadata: false` (see `openapi-ts.config.ts`), so NO field description
 * reaches the tool `inputSchema` — i.e. the JSON Schema the agent/LLM sees.
 * The agent therefore gets bare `f_RnB: string` with no hint of what it means
 * or what value format it expects.
 *
 * Rather than re-enabling metadata globally (which inflates the server bundle
 * by ~1.6 MB and would pull in unrelated upstream schema drift on regen), we
 * curate descriptions for the params where the omission actually hurts:
 * VTEX jargon (`RnB`), non-obvious value formats (date ranges), or closed
 * value sets (status). These are richer than VTEX's raw OpenAPI text on
 * purpose — e.g. `f_RnB` explains the coupon → promotion-id lookup that the
 * raw "rates and benefits" wording omits.
 *
 * Keyed by tool id → field name. Adding coverage = one line here.
 */
export const PARAM_DESCRIPTIONS: Record<string, Record<string, string>> = {
  VTEX_LIST_ORDERS: {
    f_RnB:
      "Filter orders by promotion (VTEX 'rates and benefits' / RnB). The value " +
      "is the promotion's identifier — NOT the coupon code. To count sales for " +
      "a coupon (e.g. 'FICA10') or a promotion name (e.g. 'Pop retenção DECO'), " +
      "first resolve its promotion id using the promotions tools, then pass that " +
      "id here.",
    f_creationDate:
      "Filter by order creation date. Format: " +
      "`creationDate:[<from> TO <to>]` using UTC timestamps, e.g. " +
      "`creationDate:[2026-07-25T00:00:00.000Z TO 2026-07-27T23:59:59.999Z]`.",
    f_invoicedDate:
      "Filter by invoiced date. Format: `invoicedDate:[<from> TO <to>]` using " +
      "UTC timestamps, e.g. " +
      "`invoicedDate:[2026-07-25T00:00:00.000Z TO 2026-07-27T23:59:59.999Z]`.",
    f_status:
      "Filter by order status. Valid values: " +
      "waiting-for-sellers-confirmation, payment-pending, payment-approved, " +
      "ready-for-handling, handling, invoiced, canceled.",
    q:
      "Full-text search over order id, client email, client document and " +
      "client name. The `+` character is not allowed.",
  },
};

/**
 * Return a copy of `schema` with curated `.describe()` metadata applied to any
 * field listed for `toolId`. Fields with no override, and tools with no entry,
 * are returned unchanged. Missing fields in the map are ignored (safe if the
 * generated schema changes shape).
 */
export function applyParamDescriptions(
  toolId: string,
  schema: z.ZodObject<any>,
): z.ZodObject<any> {
  const overrides = PARAM_DESCRIPTIONS[toolId];
  if (!overrides) return schema;

  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const next: Record<string, z.ZodTypeAny> = { ...shape };
  for (const [field, description] of Object.entries(overrides)) {
    if (next[field]) next[field] = next[field].describe(description);
  }
  return z.object(next);
}
