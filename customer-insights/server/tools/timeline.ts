/**
 * Tool: CUSTOMER_TIMELINE_GET (customer_timeline_get)
 *
 * Builds a unified chronological timeline for a customer by merging events from
 * three sources: billing (invoice due dates, payments received), usage (monthly
 * usage closings, usage spikes), and Gmail (customer emails classified by
 * sentiment). Supports date filtering, source filtering, chronological ordering,
 * and email inclusion toggle.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { query } from "../db.ts";
import { resolveCustomer } from "./customer-resolver.ts";
import { sanitize, sanitizeRows } from "./sanitize.ts";

type TimelineEvent = {
  id: string;
  occurred_at: string;
  type:
    | "invoice_due"
    | "payment_received"
    | "usage_monthly"
    | "usage_spike"
    | "customer_email"
    | "customer_complaint";
  source: "billing" | "usage" | "gmail";
  title: string;
  description: string;
  data: Record<string, unknown>;
};

type BillingRow = {
  due_date: unknown;
  paid_date: unknown;
  amount: unknown;
  status: unknown;
  reference_month: unknown;
  pageviews: unknown;
  requests: unknown;
  bandwidth: unknown;
  plan: unknown;
};

import { clean } from "./utils.ts";

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return 0;

    let normalized = raw.replace(/\s/g, "");
    const hasComma = normalized.includes(",");
    const hasDot = normalized.includes(".");

    if (hasComma && hasDot) {
      if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
        normalized = normalized.replace(/\./g, "").replace(",", ".");
      } else {
        normalized = normalized.replace(/,/g, "");
      }
    } else if (hasComma) {
      normalized = normalized.replace(",", ".");
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseDateHeaderToIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getGoogleAccessToken(env: Env): string {
  const authorization = (env as { MESH_REQUEST_CONTEXT?: { authorization?: unknown } })
    .MESH_REQUEST_CONTEXT?.authorization;
  if (!authorization || typeof authorization !== "string") {
    throw new Error("Not authenticated. Please login with Google first.");
  }
  return authorization.replace(/^Bearer\s+/i, "");
}

function getHeader(
  headers: Array<{ name: string; value: string }> | undefined,
  key: string,
): string | null {
  if (!headers?.length) return null;
  const header = headers.find((item) => item.name.toLowerCase() === key.toLowerCase());
  return header?.value ?? null;
}

async function listGmailMessages(
  accessToken: string,
  fromEmail: string,
  maxResults: number,
): Promise<Array<Record<string, unknown>>> {
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", `from:${fromEmail}`);
  listUrl.searchParams.set("maxResults", String(maxResults));

  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listResponse.ok) {
    const error = await listResponse.text();
    throw new Error(`Gmail list error (${listResponse.status}): ${error}`);
  }

  const listData = (await listResponse.json()) as {
    messages?: Array<{ id: string; threadId: string }>;
  };
  const messages = listData.messages ?? [];
  if (!messages.length) return [];

  return Promise.all(
    messages.map(async (msg) => {
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

      const data = (await detailResponse.json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        internalDate?: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      };

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
}

function classifyEmailEvent(subject: string, snippet: string): {
  type: TimelineEvent["type"];
  title: string;
} {
  const text = normalizeText(`${subject} ${snippet}`);
  const criticalKeywords = ["cancelamento", "processo", "procon", "advogado", "fraude"];
  const warningKeywords = [
    "problema",
    "erro",
    "falha",
    "fatura",
    "cobranca",
    "atraso",
    "inadimpl",
    "duplic",
    "contest",
  ];

  if (criticalKeywords.some((word) => text.includes(word))) {
    return {
      type: "customer_complaint",
      title: "Customer email escalation",
    };
  }

  if (warningKeywords.some((word) => text.includes(word))) {
    return {
      type: "customer_complaint",
      title: "Customer complaint via email",
    };
  }

  return {
    type: "customer_email",
    title: "Email interaction",
  };
}

function buildBillingEvents(rows: BillingRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  const statusLabel = (statusLower: string, original: string): string => {
    if (statusLower.includes("paid")) return "paid";
    if (statusLower.includes("overdue")) return "overdue";
    if (statusLower.includes("pending")) return "pending";
    if (statusLower.includes("open")) return "open";
    return original || "registered";
  };

  rows.forEach((row, idx) => {
    const dueAt = toIso(row.due_date);
    const paidAt = toIso(row.paid_date);
    const amount = toNumber(row.amount);
    const status = String(row.status ?? "").trim();
    const statusLower = status.toLowerCase();
    const referenceMonth = toIso(row.reference_month);

    if (dueAt) {
      events.push({
        id: `invoice_due_${idx}_${dueAt}`,
        occurred_at: dueAt,
        type: "invoice_due",
        source: "billing",
        title: `Invoice ${statusLabel(statusLower, status)}`,
        description: `Invoice of R$ ${amount.toFixed(2)} due on ${dueAt}.`,
        data: {
          due_date: dueAt,
          paid_date: paidAt,
          amount,
          status,
          reference_month: referenceMonth,
        },
      });
    }

    if (paidAt) {
      events.push({
        id: `payment_received_${idx}_${paidAt}`,
        occurred_at: paidAt,
        type: "payment_received",
        source: "billing",
        title: "Payment received",
        description: `Payment of R$ ${amount.toFixed(2)} recorded on ${paidAt}.`,
        data: {
          paid_date: paidAt,
          due_date: dueAt,
          amount,
          status,
        },
      });
    }
  });

  return events;
}

function buildUsageEvents(rows: BillingRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const ordered = rows
    .map((row) => ({
      reference_month: toIso(row.reference_month),
      pageviews: toNumber(row.pageviews),
      requests: toNumber(row.requests),
      bandwidth: row.bandwidth === null || row.bandwidth === undefined
        ? null
        : toNumber(row.bandwidth),
      plan: row.plan ?? null,
    }))
    .filter((row) => !!row.reference_month)
    .sort(
      (a, b) =>
        new Date(a.reference_month as string).getTime() -
        new Date(b.reference_month as string).getTime(),
    );

  ordered.forEach((row, idx) => {
    const occurredAt = row.reference_month as string;
    events.push({
      id: `usage_monthly_${idx}_${occurredAt}`,
      occurred_at: occurredAt,
      type: "usage_monthly",
      source: "usage",
      title: "Monthly usage closing",
      description:
        `Pageviews: ${row.pageviews.toLocaleString("en-US")} | ` +
        `Requests: ${row.requests.toLocaleString("en-US")}`,
      data: {
        reference_month: occurredAt,
        pageviews: row.pageviews,
        requests: row.requests,
        bandwidth: row.bandwidth,
        plan: row.plan,
      },
    });

    if (idx === 0) return;

    const prev = ordered[idx - 1];
    const pageviewsRatio = prev.pageviews > 0 ? row.pageviews / prev.pageviews : 1;
    const requestsRatio = prev.requests > 0 ? row.requests / prev.requests : 1;
    const strongestRatio = Math.max(pageviewsRatio, requestsRatio);

    if (strongestRatio >= 1.15) {
      events.push({
        id: `usage_spike_${idx}_${occurredAt}`,
        occurred_at: occurredAt,
        type: "usage_spike",
        source: "usage",
        title: "Usage spike detected",
        description:
          `${(strongestRatio * 100 - 100).toFixed(1)}% increase ` +
          `vs previous month.`,
        data: {
          reference_month: occurredAt,
          current: {
            pageviews: row.pageviews,
            requests: row.requests,
          },
          previous: {
            pageviews: prev.pageviews,
            requests: prev.requests,
          },
          ratio: Number(strongestRatio.toFixed(2)),
        },
      });
    }
  });

  return events;
}

function buildEmailEvents(messages: Array<Record<string, unknown>>): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  messages.forEach((message) => {
    const subject = String(message.subject ?? "");
    const snippet = String(message.snippet ?? "");
    const occurredAt =
      toIso(message.internal_date) ??
      parseDateHeaderToIso(message.date) ??
      null;
    if (!occurredAt) return;

    const classification = classifyEmailEvent(subject, snippet);
    events.push({
      id: `email_${String(message.id ?? occurredAt)}`,
      occurred_at: occurredAt,
      type: classification.type,
      source: "gmail",
      title: classification.title,
      description: subject || snippet || "Email without subject",
      data: {
        message_id: message.id ?? null,
        thread_id: message.thread_id ?? null,
        subject,
        from: message.from ?? null,
        to: message.to ?? null,
        date: message.date ?? null,
        snippet,
      },
    });
  });

  return events;
}

function applyDateFilter(
  events: TimelineEvent[],
  startDate?: string,
  endDate?: string,
): TimelineEvent[] {
  const startTs = startDate ? Date.parse(startDate) : null;
  const endTs = endDate ? Date.parse(endDate) : null;
  const start = Number.isFinite(startTs) ? (startTs as number) : null;
  const end = Number.isFinite(endTs) ? (endTs as number) : null;

  return events.filter((event) => {
    const ts = Date.parse(event.occurred_at);
    if (!Number.isFinite(ts)) return false;
    if (start !== null && ts < start) return false;
    if (end !== null && ts > end) return false;
    return true;
  });
}

function sortEvents(events: TimelineEvent[], order: "asc" | "desc"): TimelineEvent[] {
  return events.sort((a, b) => {
    const aTs = Date.parse(a.occurred_at);
    const bTs = Date.parse(b.occurred_at);
    return order === "asc" ? aTs - bTs : bTs - aTs;
  });
}

export const createTimelineTool = (env: Env) =>
  createPrivateTool({
    id: "customer_timeline_get",
    description:
      "Builds a unified customer timeline with billing, usage, and email events in chronological order.",

    inputSchema: z.object({
      customer_id: z.string().optional()
        .describe("Numeric customer ID (recommended, unique). E.g.: 1108. Takes priority over customer_name if provided."),
      customer_name: z.string().optional()
        .describe("Customer name (exact and partial search). E.g.: Acme Corp. Warning: names are not unique — prefer customer_id."),
      max_events: z.preprocess(
        (value) => {
          if (value === null || value === undefined) return undefined;
          if (typeof value === "string" && value.trim() === "") return undefined;
          return value;
        },
        z.coerce.number().int().min(1).max(500).default(100),
      ).describe("Maximum number of events returned (default: 100, max: 500)."),
      order: z.string().default("desc")
        .describe("Chronological order. Options: asc (oldest first) | desc (default, most recent first)"),
      include_emails: z.preprocess(
        (value) => {
          if (value === null || value === undefined) return undefined;
          if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            if (normalized === "") return undefined;
            if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
            if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
          }
          return value;
        },
        z.boolean().default(true),
      ).describe("Include email events (requires Google OAuth). Default: true"),
      email_max_results: z.preprocess(
        (value) => {
          if (value === null || value === undefined) return undefined;
          if (typeof value === "string" && value.trim() === "") return undefined;
          return value;
        },
        z.coerce.number().int().min(1).max(50).default(15),
      ).describe("Maximum number of emails collected for timeline (default: 15, max: 50)."),
      start_date: z.string().optional()
        .describe("Start date filter. Format: YYYY-MM-DD. E.g.: 2024-01-01"),
      end_date: z.string().optional()
        .describe("End date filter. Format: YYYY-MM-DD. E.g.: 2024-12-31"),
      sources: z.string().optional()
        .describe("Filter which sources appear in timeline. Comma-separated options: billing, usage, gmail. E.g.: billing,usage"),
    }),

    outputSchema: z.object({
      customer_found: z.boolean(),
      customer: z.any().nullable(),
      match_type: z.enum(["id", "exact", "partial"]).optional(),
      total_events: z.number(),
      events: z.array(z.any()),
      summary: z.any(),
      _meta: z.any(),
    }),

    execute: async ({ context }) => {
      const resolved = await resolveCustomer({
        customer_id: clean(context.customer_id),
        customer_name: clean(context.customer_name),
      });
      const customer = resolved.customer;

      const billingRaw = await query<BillingRow>(
        `SELECT
          due_date,
          paid_date,
          amount,
          status,
          reference_month,
          pageviews,
          requests,
          bandwidth,
          plan
        FROM v_billing
        WHERE id = ${customer.id}
        ORDER BY due_date DESC`,
      );

      const billingRows = sanitizeRows(
        billingRaw as Record<string, unknown>[],
      ) as BillingRow[];

      const billingEvents = buildBillingEvents(billingRows);
      const usageEvents = buildUsageEvents(billingRows);
      let emailEvents: TimelineEvent[] = [];
      const meta: Record<string, unknown> = {
        email_enabled: false,
      };

      if (context.include_emails) {
        try {
          const accessToken = getGoogleAccessToken(env);
          const messages = await listGmailMessages(
            accessToken,
            customer.email,
            context.email_max_results,
          );
          emailEvents = buildEmailEvents(messages);
          meta.email_enabled = true;
          meta.gmail_query = `from:${customer.email}`;
        } catch (err) {
          meta.email_enabled = false;
          meta.email_error = (err as Error).message;
        }
      }

      const rawSources = clean(context.sources as unknown as string);
      const sourcesArr = rawSources
        ? rawSources.split(",").map((s: string) => s.trim()).filter(Boolean)
        : null;
      const sourceFilter = sourcesArr?.length
        ? new Set(sourcesArr)
        : null;
      const allEvents = [...billingEvents, ...usageEvents, ...emailEvents].filter((event) =>
        sourceFilter ? sourceFilter.has(event.source) : true
      );
      const filtered = applyDateFilter(
        allEvents,
        clean(context.start_date),
        clean(context.end_date),
      );
      const order = (clean(context.order) === "asc" ? "asc" : "desc") as "asc" | "desc";
      const ordered = sortEvents(filtered, order).slice(0, context.max_events);

      return sanitize({
        customer_found: true,
        customer,
        match_type: resolved.match_type,
        total_events: ordered.length,
        events: ordered,
        summary: {
          billing_events: ordered.filter((event) => event.source === "billing").length,
          usage_events: ordered.filter((event) => event.source === "usage").length,
          email_events: ordered.filter((event) => event.source === "gmail").length,
          complaint_events: ordered.filter(
            (event) => event.type === "customer_complaint",
          ).length,
        },
        _meta: meta,
      });
    },
  });
