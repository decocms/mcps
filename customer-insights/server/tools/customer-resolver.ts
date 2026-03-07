/**
 * Customer Resolver
 *
 * Resolves a customer by ID (preferred) or name against the v_customer_contacts
 * view joined with v_billing. Customer ID (team or billing ID) is the recommended
 * identifier as it is unique. Name-based lookup supports exact match, partial match,
 * and handles ambiguous results by returning candidate IDs so the caller can retry
 * with a unique customer_id.
 */

import { query } from "../db.ts";
import { sanitizeRows } from "./sanitize.ts";

export type CustomerRow = {
  id: number;
  name: string;
  email: string;
};

export type CustomerMatchType = "id" | "exact" | "partial";

export type ResolvedCustomer = {
  customer: CustomerRow;
  match_type: CustomerMatchType;
};

import { escapeSqlLiteral } from "./utils.ts";

// Looks up a customer by their numeric ID. The INNER JOIN ensures we only
// return customers that have billing data — a contact without invoices is not
// useful to any tool and would cause downstream queries to return empty results.
async function findById(customerId: string): Promise<CustomerRow | null> {
  const id = Number(customerId);
  if (!Number.isFinite(id)) return null;

  const rows = await query<CustomerRow>(
    `SELECT c.id, c.name, c.email
     FROM v_customer_contacts c
     INNER JOIN (SELECT DISTINCT id FROM v_billing) b
       ON b.id = c.id
     WHERE c.id = ${id}
     LIMIT 1`,
  );

  const sanitized = sanitizeRows(rows as Record<string, unknown>[]) as CustomerRow[];
  return sanitized[0] ?? null;
}

// Name-based lookup with a two-pass strategy:
//   Pass 1: exact match (case-insensitive) — fast and unambiguous when the
//           caller already knows the full name.
//   Pass 2: partial match (LIKE %name%) — fallback for partial names, but
//           throws if multiple candidates match to avoid returning the wrong customer.
// Throwing instead of returning null lets the caller surface a helpful error
// message with candidate IDs so the user can retry with the right ID.
async function findByName(customerName: string): Promise<ResolvedCustomer> {
  const escaped = escapeSqlLiteral(customerName.trim());

  if (!escaped) {
    throw new Error("Please provide customer_id (recommended) or customer_name.");
  }

  const baseFrom = `
    FROM v_customer_contacts c
    INNER JOIN (SELECT DISTINCT id FROM v_billing) b
      ON b.id = c.id
  `;

  const exactRows = await query<CustomerRow>(
    `SELECT c.id, c.name, c.email
     ${baseFrom}
     WHERE LOWER(c.name) = LOWER('${escaped}')
     ORDER BY c.id`,
  );
  const exact = sanitizeRows(exactRows as Record<string, unknown>[]) as CustomerRow[];

  if (exact.length === 1) {
    return { customer: exact[0], match_type: "exact" };
  }
  // Multiple exact matches means the same name exists for different customers.
  // Surface all candidates so the caller can ask the user to pick by ID.
  if (exact.length > 1) {
    throw new Error(
      `Ambiguous name "${customerName}". Multiple customers found. ` +
      `Please use customer_id instead. Candidates: ${exact.map((c) => `ID ${c.id}: ${c.name} <${c.email}>`).join("; ")}`,
    );
  }

  // No exact match — try partial (substring) search as a second chance.
  const partialRows = await query<CustomerRow>(
    `SELECT c.id, c.name, c.email
     ${baseFrom}
     WHERE LOWER(c.name) LIKE LOWER('%${escaped}%')
     ORDER BY c.name, c.id`,
  );
  const partial = sanitizeRows(partialRows as Record<string, unknown>[]) as CustomerRow[];

  if (partial.length === 1) {
    return { customer: partial[0], match_type: "partial" };
  }
  if (partial.length > 1) {
    throw new Error(
      `Ambiguous name "${customerName}". Multiple customers found. ` +
      `Please use customer_id instead. Candidates: ${partial
        .slice(0, 10)
        .map((c) => `ID ${c.id}: ${c.name} <${c.email}>`)
        .join("; ")}`,
    );
  }

  throw new Error("Customer not found in contacts/billing database. Try searching by customer_id.");
}

export async function resolveCustomer(input: {
  customer_id?: string;
  customer_name?: string;
}): Promise<ResolvedCustomer> {
  const customerId = input.customer_id?.trim();
  const customerName = input.customer_name?.trim();

  if (customerId) {
    const byId = await findById(customerId);
    if (!byId) {
      throw new Error("Customer not found for the given customer_id.");
    }
    return { customer: byId, match_type: "id" };
  }

  if (customerName) {
    return await findByName(customerName);
  }

  throw new Error("Please provide customer_id (recommended, unique) or customer_name.");
}

/**
 * Resolves all customers that share the same email domain.
 * Useful for corporate clients where multiple contacts exist under @company.com.
 */
export async function resolveCustomersByDomain(domain: string): Promise<CustomerRow[]> {
  const escaped = escapeSqlLiteral(domain.trim().toLowerCase().replace(/^@/, ""));

  if (!escaped) {
    throw new Error("Please provide a valid email domain (e.g.: empresa.com or @empresa.com).");
  }

  const rows = await query<CustomerRow>(
    `SELECT c.id, c.name, c.email
     FROM v_customer_contacts c
     INNER JOIN (SELECT DISTINCT id FROM v_billing) b
       ON b.id = c.id
     WHERE LOWER(c.email) LIKE '%@${escaped}'
     ORDER BY c.name, c.id`,
  );

  return sanitizeRows(rows as Record<string, unknown>[]) as CustomerRow[];
}
