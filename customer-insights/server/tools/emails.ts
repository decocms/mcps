/**
 * Tool: CUSTOMER_EMAILS_GET (customer_emails_get)
 *
 * Searches for a customer by ID or name and returns emails sent by that customer
 * via Gmail (Google OAuth). Supports filtering by subject text, date range, and
 * maximum results. Uses the Gmail API with metadata format to retrieve subject,
 * from, to, date, and snippet for each message.
 *
 * Also supports domain-based email search (e.g., @empresa.com) for corporate
 * clients, where multiple contacts from the same company may send emails.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { query } from "../db.ts";
import { resolveCustomer, resolveCustomersByDomain, type CustomerRow } from "./customer-resolver.ts";
import { sanitizeRows } from "./sanitize.ts";

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
};

type GmailMessageResponse = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
};

type NameSearchResult = {
  selected: CustomerRow | null;
  matchType: "exact" | "partial" | "none" | "ambiguous";
  candidates: CustomerRow[];
};

import { clean, escapeSqlLiteral } from "./utils.ts";

function toGmailDate(value?: Date | string): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function getHeader(
  headers: Array<{ name: string; value: string }> | undefined,
  key: string,
): string | null {
  if (!headers?.length) return null;
  const header = headers.find((item) => item.name.toLowerCase() === key.toLowerCase());
  return header?.value ?? null;
}

function getGoogleAccessToken(env: Env): string {
  const authorization = (env as any)?.MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization || typeof authorization !== "string") {
    throw new Error("Not authenticated. Please login with Google first.");
  }
  return authorization.replace(/^Bearer\s+/i, "");
}

async function findCustomersByName(customerName: string): Promise<NameSearchResult> {
  const escaped = escapeSqlLiteral(customerName);
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
    return { selected: exact[0], matchType: "exact", candidates: exact };
  }
  if (exact.length > 1) {
    return { selected: null, matchType: "ambiguous", candidates: exact };
  }

  const partialRows = await query<CustomerRow>(
    `SELECT c.id, c.name, c.email
     ${baseFrom}
     WHERE LOWER(c.name) LIKE LOWER('%${escaped}%')
     ORDER BY c.name, c.id`,
  );
  const partial = sanitizeRows(partialRows as Record<string, unknown>[]) as CustomerRow[];

  if (partial.length === 1) {
    return { selected: partial[0], matchType: "partial", candidates: partial };
  }
  if (partial.length > 1) {
    return { selected: null, matchType: "ambiguous", candidates: partial };
  }

  return { selected: null, matchType: "none", candidates: [] };
}

async function listGmailMessages(
  accessToken: string,
  fromEmail: string,
  maxResults: number,
  filters: {
    subjectContains?: string;
    textContains?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<{ query: string; messages: Array<Record<string, unknown>> }> {
  const terms = [`from:${fromEmail}`];
  const subjectContains = filters.subjectContains?.trim();
  const textContains = filters.textContains?.trim();
  if (subjectContains) {
    const subjectTerms = subjectContains
      .split(/\s+/)
      .map((term) => term.trim().replace(/[()"]/g, ""))
      .filter(Boolean);
    for (const term of subjectTerms) {
      terms.push(`subject:${term}`);
    }
  }

  // Free-text search in Gmail query (can match subject/body).
  if (textContains) {
    const freeTerms = textContains
      .split(/\s+/)
      .map((term) => term.trim().replace(/[()"]/g, ""))
      .filter(Boolean);
    for (const term of freeTerms) {
      terms.push(term);
    }
  }

  const startDate = toGmailDate(filters.startDate);
  if (startDate) {
    terms.push(`after:${startDate}`);
  }

  const endDate = toGmailDate(filters.endDate);
  if (endDate) {
    terms.push(`before:${endDate}`);
  }

  const gmailQuery = terms.join(" ");
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", gmailQuery);
  listUrl.searchParams.set("maxResults", String(maxResults));

  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listResponse.ok) {
    const error = await listResponse.text();
    throw new Error(`Gmail list error (${listResponse.status}): ${error}`);
  }

  const listData = (await listResponse.json()) as GmailListResponse;
  const listedMessages = listData.messages ?? [];
  if (!listedMessages.length) return { query: gmailQuery, messages: [] };

  const detailed = await Promise.all(
    listedMessages.map(async (msg) => {
      const detailUrl = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
      );
      detailUrl.searchParams.set("format", "metadata");
      detailUrl.searchParams.set("metadataHeaders", "Subject");
      detailUrl.searchParams.append("metadataHeaders", "From");
      detailUrl.searchParams.append("metadataHeaders", "To");
      detailUrl.searchParams.append("metadataHeaders", "Date");

      const detailResponse = await fetch(detailUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!detailResponse.ok) {
        const error = await detailResponse.text();
        throw new Error(`Gmail message error (${detailResponse.status}): ${error}`);
      }

      const data = (await detailResponse.json()) as GmailMessageResponse;
      const headers = data.payload?.headers;

      let internalDateIso: string | null = null;
      if (data.internalDate) {
        const parsed = Number(data.internalDate);
        if (Number.isFinite(parsed)) {
          internalDateIso = new Date(parsed).toISOString();
        }
      }

      return {
        id: data.id,
        thread_id: data.threadId,
        subject: getHeader(headers, "Subject"),
        from: getHeader(headers, "From"),
        to: getHeader(headers, "To"),
        date: getHeader(headers, "Date"),
        snippet: data.snippet ?? "",
        internal_date: internalDateIso,
      };
    }),
  );

  let messages = detailed;
  if (subjectContains) {
    const normalizedFilter = subjectContains.toLowerCase();
    messages = detailed.filter((message) =>
      String(message.subject ?? "").toLowerCase().includes(normalizedFilter)
    );
  }
  if (textContains) {
    const normalizedText = textContains.toLowerCase();
    messages = messages.filter((message) => {
      const subject = String(message.subject ?? "").toLowerCase();
      const snippet = String(message.snippet ?? "").toLowerCase();
      return subject.includes(normalizedText) || snippet.includes(normalizedText);
    });
  }

  return { query: gmailQuery, messages };
}

export const createCustomerEmailsTool = (env: Env) =>
  createPrivateTool({
    id: "customer_emails_get",
    description:
      "Searches for a customer by ID or name and returns emails sent by that customer via Gmail (Google OAuth).",

    inputSchema: z.object({
      customer_id: z.string().optional()
        .describe("Numeric customer ID (recommended, unique). E.g.: 1108. Takes priority over customer_name if provided."),
      customer_name: z.string().optional()
        .describe("Customer name for contact table lookup. E.g.: Acme Corp."),
      email_domain: z.string().optional()
        .describe("Email domain for corporate search (e.g.: empresa.com or @empresa.com). Searches emails from all contacts matching this domain. Useful for large corporate clients where multiple people may send emails."),
      subject_contains: z.string().optional()
        .describe("Text term informed by user. By default this is also used as full-text match (subject/snippet)."),
      text_contains: z.string().optional()
        .describe("Filter by text mention in subject OR snippet/body preview. E.g.: invoice"),
      strict_subject_match: z.boolean().optional()
        .describe("When true, applies strict subject-only filtering using subject_contains."),
      start_date: z.string().optional()
        .describe("Start date for email search. Format: YYYY-MM-DD. E.g.: 2024-01-01"),
      end_date: z.string().optional()
        .describe("End date for email search. Format: YYYY-MM-DD. E.g.: 2024-12-31"),
      max_results: z.preprocess(
        (value) => {
          if (value === null || value === undefined) return undefined;
          if (typeof value === "string" && value.trim() === "") return undefined;
          return value;
        },
        z.coerce.number().int().min(1).max(50).default(10),
      ).describe("Maximum number of emails returned (default: 10, max: 50)."),
    }),

    outputSchema: z.object({
      customer_found: z.boolean(),
      match_type: z.enum(["id", "exact", "partial", "none", "ambiguous", "domain"]),
      customer: z.any().nullable(),
      candidates: z.array(z.any()),
      domain_contacts: z.array(z.any()).optional(),
      total_messages: z.number(),
      messages: z.array(z.any()),
      _meta: z.any(),
    }),

    execute: async ({ context }) => {
      const customerId = clean(context.customer_id);
      const customerName = clean(context.customer_name);
      const emailDomain = clean(context.email_domain);
      const rawSubjectContains = clean(context.subject_contains);
      const rawTextContains = clean(context.text_contains);
      const strictSubjectMatch = context.strict_subject_match === true;
      const effectiveTextContains = rawTextContains ?? rawSubjectContains;
      const effectiveSubjectContains = strictSubjectMatch ? rawSubjectContains : undefined;

      if (emailDomain) {
        const domainClean = emailDomain.trim().toLowerCase().replace(/^@/, "");

        let accessToken: string;
        try {
          accessToken = getGoogleAccessToken(env);
        } catch (err) {
          let domainContacts: CustomerRow[] = [];
          try {
            domainContacts = await resolveCustomersByDomain(domainClean);
          } catch { /* ignore */ }

          return {
            customer_found: domainContacts.length > 0,
            match_type: "domain" as const,
            customer: domainContacts[0] ?? null,
            candidates: domainContacts,
            domain_contacts: domainContacts,
            total_messages: 0,
            messages: [],
            _meta: {
              search_mode: "domain",
              domain: domainClean,
              reason: (err as Error).message,
              required_scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
            },
          };
        }

        let domainContacts: CustomerRow[] = [];
        try {
          domainContacts = await resolveCustomersByDomain(domainClean);
        } catch { /* ignore */ }

        try {
          const result = await listGmailMessages(accessToken, `@${domainClean}`, context.max_results, {
            subjectContains: effectiveSubjectContains,
            textContains: effectiveTextContains,
            startDate: clean(context.start_date),
            endDate: clean(context.end_date),
          });

          return {
            customer_found: true,
            match_type: "domain" as const,
            customer: domainContacts[0] ?? null,
            candidates: domainContacts,
            domain_contacts: domainContacts,
            total_messages: result.messages.length,
            messages: result.messages,
            _meta: {
              search_mode: "domain",
              domain: domainClean,
              gmail_query: result.query,
              known_contacts_in_domain: domainContacts.length,
            },
          };
        } catch (err) {
          return {
            customer_found: domainContacts.length > 0,
            match_type: "domain" as const,
            customer: domainContacts[0] ?? null,
            candidates: domainContacts,
            domain_contacts: domainContacts,
            total_messages: 0,
            messages: [],
            _meta: {
              search_mode: "domain",
              domain: domainClean,
              error: (err as Error).message,
              known_contacts_in_domain: domainContacts.length,
            },
          };
        }
      }

      let selected: CustomerRow | null = null;
      let matchType: "id" | "exact" | "partial" | "none" | "ambiguous" = "none";
      let candidates: CustomerRow[] = [];

      if (customerId) {
        try {
          const resolved = await resolveCustomer({
            customer_id: customerId,
            customer_name: customerName,
          });
          selected = resolved.customer;
          matchType = resolved.match_type;
          candidates = [resolved.customer];
        } catch {
          return {
            customer_found: false,
            match_type: "none" as const,
            customer: null,
            candidates: [],
            total_messages: 0,
            messages: [],
            _meta: {
              search_mode: "standard",
              reason: "Customer not found for the given customer_id.",
            },
          };
        }
      } else {
        const search = await findCustomersByName(customerName?.trim() ?? "");
        selected = search.selected;
        matchType = search.matchType;
        candidates = search.candidates;
      }

      if (matchType === "none") {
        return {
          customer_found: false,
          match_type: "none" as const,
          customer: null,
          candidates: [],
          total_messages: 0,
          messages: [],
          _meta: {
            search_mode: "standard",
            reason: "No customer found in the contacts table linked to billing. Try using customer_id or email_domain.",
          },
        };
      }

      if (matchType === "ambiguous") {
        return {
          customer_found: false,
          match_type: "ambiguous" as const,
          customer: null,
          candidates,
          total_messages: 0,
          messages: [],
          _meta: {
            search_mode: "standard",
            reason: "Multiple customers found. Please use customer_id (unique) instead, or try email_domain for corporate searches.",
          },
        };
      }

      const customer = selected as CustomerRow;
      let accessToken: string;
      try {
        accessToken = getGoogleAccessToken(env);
      } catch (err) {
        return {
          customer_found: true,
          match_type: matchType,
          customer,
          candidates,
          total_messages: 0,
          messages: [],
          _meta: {
            search_mode: "standard",
            reason: (err as Error).message,
            required_scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
          },
        };
      }

      try {
        const result = await listGmailMessages(accessToken, customer.email, context.max_results, {
          subjectContains: effectiveSubjectContains,
          textContains: effectiveTextContains,
          startDate: clean(context.start_date),
          endDate: clean(context.end_date),
        });

        return {
          customer_found: true,
          match_type: matchType,
          customer,
          candidates,
          total_messages: result.messages.length,
          messages: result.messages,
          _meta: {
            search_mode: "standard",
            gmail_query: result.query,
          },
        };
      } catch (err) {
        return {
          customer_found: true,
          match_type: matchType,
          customer,
          candidates,
          total_messages: 0,
          messages: [],
          _meta: {
            search_mode: "standard",
            error: (err as Error).message,
          },
        };
      }
    },
  });
