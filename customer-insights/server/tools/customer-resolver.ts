/**
 * Customer Resolver
 *
 * Resolves a customer by ID (preferred) or name against v_billing.
 * Customer name is extracted directly from the billing view (no separate contacts table).
 * Name-based lookup supports exact match, partial match, and handles ambiguous results
 * by returning candidate names so the caller can retry with the right customer_name.
 */

import { query } from "../db.ts";
import { sanitizeRows } from "./sanitize.ts";

export type CustomerRow = {
  name: string;
  email: string;
};

export type CustomerMatchType = "exact" | "partial";

export type ResolvedCustomer = {
  customer: CustomerRow;
  match_type: CustomerMatchType;
};

import { escapeSqlLiteral } from "./utils.ts";

// Name-based lookup with a two-pass strategy:
//   Pass 1: exact match (case-insensitive) — fast and unambiguous when the
//           caller already knows the full name.
//   Pass 2: partial match (LIKE %name%) — fallback for partial names, but
//           throws if multiple candidates match to avoid returning the wrong customer.
// Throwing instead of returning null lets the caller surface a helpful error
// message with candidate names so the user can retry with the right name.
async function findByName(customerName: string): Promise<ResolvedCustomer> {
  const escaped = escapeSqlLiteral(customerName.trim());

  if (!escaped) {
    throw new Error("Please provide customer_name.");
  }

  // Get distinct customers from billing data
  const baseQuery = `
    FROM (
      SELECT DISTINCT name, email
      FROM v_billing
      WHERE name IS NOT NULL
    ) c
  `;

  const exactRows = await query<CustomerRow>(
    `SELECT c.name, c.email
     ${baseQuery}
     WHERE LOWER(c.name) = LOWER('${escaped}')
     ORDER BY c.name`,
  );
  const exact = sanitizeRows(
    exactRows as Record<string, unknown>[],
  ) as CustomerRow[];

  if (exact.length === 1) {
    return { customer: exact[0], match_type: "exact" };
  }
  // Multiple exact matches means the same name exists with different emails.
  // Surface all candidates so the caller can ask the user to pick.
  if (exact.length > 1) {
    throw new Error(
      `Ambiguous name "${customerName}". Multiple customers found. ` +
        `Candidates: ${exact.map((c) => `${c.name} <${c.email}>`).join("; ")}`,
    );
  }

  // No exact match — try partial (substring) search as a second chance.
  const partialRows = await query<CustomerRow>(
    `SELECT c.name, c.email
     ${baseQuery}
     WHERE LOWER(c.name) LIKE LOWER('%${escaped}%')
     ORDER BY c.name`,
  );
  const partial = sanitizeRows(
    partialRows as Record<string, unknown>[],
  ) as CustomerRow[];

  if (partial.length === 1) {
    return { customer: partial[0], match_type: "partial" };
  }
  if (partial.length > 1) {
    throw new Error(
      `Ambiguous name "${customerName}". Multiple customers found. ` +
        `Candidates: ${partial

          .slice(0, 10)

          .map((c) => `${c.name} <${c.email}>`)

          .join("; ")}`,
    );
  }

  throw new Error("Customer not found in billing database.");
}

export async function resolveCustomer(input: {
  customer_name?: string;
}): Promise<ResolvedCustomer> {
  const customerName = input.customer_name?.trim();

  if (customerName) {
    return await findByName(customerName);
  }

  throw new Error("Please provide customer_name.");
}

/**
 * Resolves all customers that share the same email domain.
 * Useful for corporate clients where multiple contacts exist under @company.com.
 */
export async function resolveCustomersByDomain(
  domain: string,
): Promise<CustomerRow[]> {
  const escaped = escapeSqlLiteral(
    domain.trim().toLowerCase().replace(/^@/, ""),
  );

  if (!escaped) {
    throw new Error(
      "Please provide a valid email domain (e.g.: empresa.com or @empresa.com).",
    );
  }

  const rows = await query<CustomerRow>(
    `SELECT DISTINCT name, email
     FROM v_billing
     WHERE name IS NOT NULL
       AND LOWER(email) LIKE '%@${escaped}'
     ORDER BY name`,
  );

  return sanitizeRows(rows as Record<string, unknown>[]) as CustomerRow[];
}
