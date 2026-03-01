/**
 * Tool: CUSTOMER_BILLING_GET (customer_billing_get)
 *
 * Returns the invoice history for a specific customer with computed financial
 * metrics for each billing period. The customer can be identified by numeric
 * ID (preferred, unique) or by name (exact or partial match).
 *
 * Key behaviors:
 * - Default window: last 6 invoices. Use limit=120 for full history.
 * - When the user asks for "last N months", pass months=N instead of limit.
 * - Status values: "paid", "overdue", "pending" — mapped from raw CSV values.
 * - The response includes a pre-formatted summary_text field that must be
 *   copied verbatim to the user — never recalculate it manually.
 * - Always display ALL returned invoices, never a subset.
 *
 * Data source: v_billing DuckDB view (loaded from billing.csv).
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { query } from "../db.ts";
import { resolveCustomer } from "./customer-resolver.ts";
import { sanitize, sanitizeRows } from "./sanitize.ts";
import { clean, toDateOnly, escapeSqlLiteral, daysBetween, round2 } from "./utils.ts";

export const createBillingTool = (_env: Env) =>
  createPrivateTool({
    id: "customer_billing_get",
    description:
      "Returns the customer invoice history with financial metrics. " +
      "Default: returns last 6 invoices. For full history, set limit=120. " +
      "When user asks for 'últimos N meses', set months=N. " +
      "All metrics and summary_text cover ONLY the returned invoices. " +
      "Always copy summary_text verbatim — never recalculate. " +
      "Display ALL returned invoices — NEVER show a subset.",

    inputSchema: z.object({
      customer_id: z.string().optional()
        .describe("ID numérico do cliente (único e recomendado). Ex: 1108. Tem prioridade sobre o nome."),
      customer_name: z.string().optional()
        .describe("Nome do cliente (busca exata ou parcial). Ex: Acme Corp. Nomes podem se repetir, prefira o ID."),
      status: z.string().optional()
        .describe("Filtro por status da fatura. Opções: paid (pago), overdue (atrasada), pending (pendente)."),
      months: z.preprocess(
        (value) => {
          if (value === null || value === undefined) return undefined;
          if (typeof value === "string" && value.trim() === "") return undefined;
          return value;
        },
        z.coerce.number().int().min(1).max(60).optional(),
      ).describe("Obrigatório para pedidos de tempo como 'últimos 6 meses'. Retorna apenas os N meses mais recentes."),
      start_reference_month: z.string().optional()
        .describe("Data inicial do período de uso (billing period). Formato: YYYY-MM-DD."),
      end_reference_month: z.string().optional()
        .describe("Data final do período de uso (billing period). Formato: YYYY-MM-DD."),
      start_due_date: z.string().optional()
        .describe("Data inicial de vencimento da fatura. Formato: YYYY-MM-DD."),
      end_due_date: z.string().optional()
        .describe("Data final de vencimento da fatura. Formato: YYYY-MM-DD."),
      limit: z.preprocess(
        (value) => {
          if (value === null || value === undefined) return undefined;
          if (typeof value === "string" && value.trim() === "") return undefined;
          return value;
        },
        z.coerce.number().int().min(1).max(120).default(6),
      ).describe("Limite de faturas retornadas (padrão: 6, máx: 120). Use months para filtros de tempo."),
    }),

    outputSchema: z.object({
      customer: z.any(),
      match_type: z.enum(["id", "exact", "partial"]),
      total_invoices: z.number(),
      metrics: z.object({
        average_monthly_billing: z.number(),
        last_payment_days_ago: z.number().nullable(),
        dso_avg_days: z.number().nullable(),
        total_amount_by_status: z.object({
          paid: z.number(),
          overdue: z.number(),
          pending: z.number(),
        }),
        total_billed: z.number(),
        invoices_paid: z.number(),
        invoices_overdue: z.number(),
      }),
      overage: z.object({
        overage_total: z.number(),
        overage_percentage: z.number(),
        overage_breakdown: z.object({
          extra_pageviews: z.number(),
          extra_requests: z.number(),
          extra_bandwidth: z.number(),
        }),
        seats_builders: z.number().nullable(),
        seats_builder_cost: z.number(),
        support_price: z.number(),
        margin_bleed_alert: z.boolean(),
      }),
      invoices: z.array(z.any()),
      invoice_table_text: z.string(),
      summary_text: z.string(),
      _llm_instruction: z.string(),
    }),

    execute: async ({ context }) => {
      // Normalize inputs: clean() trims whitespace and converts empty strings
      // to undefined so we can safely check truthiness throughout.
      const customerId = clean(context.customer_id);
      const customerName = clean(context.customer_name);
      const statusFilter = clean(context.status);

      // Resolve the customer against the contacts + billing views.
      // resolveCustomer throws if no match is found, halting execution early
      // rather than running an expensive billing query for an unknown ID.
      const resolved = await resolveCustomer({
        customer_id: customerId,
        customer_name: customerName,
      });

      // Build the WHERE clause dynamically — start with the customer ID filter
      // and append optional date/status constraints as they are provided.
      const conditions = [`id = ${resolved.customer.id}`];

      if (statusFilter) {
        conditions.push(
          `LOWER(status) = LOWER('${escapeSqlLiteral(statusFilter)}')`,
        );
      }

      const startRefMonth = toDateOnly(clean(context.start_reference_month));
      if (startRefMonth) {
        conditions.push(`reference_month >= '${startRefMonth}'`);
      }
      const endRefMonth = toDateOnly(clean(context.end_reference_month));
      if (endRefMonth) {
        conditions.push(`reference_month <= '${endRefMonth}'`);
      }

      const startDueDate = toDateOnly(clean(context.start_due_date));
      if (startDueDate) {
        conditions.push(`due_date >= '${startDueDate}'`);
      }
      const endDueDate = toDateOnly(clean(context.end_due_date));
      if (endDueDate) {
        conditions.push(`due_date <= '${endDueDate}'`);
      }

      const monthsParam = context.months;
      if (monthsParam) {
        // "Last N months" filter: find the earliest reference_month among the
        // N most recent distinct months for this customer, then keep everything
        // from that cutoff onwards. This is safer than subtracting N months
        // from today because it respects the actual months present in the data.
        conditions.push(`reference_month >= (
          SELECT MIN(rm) FROM (
            SELECT DISTINCT reference_month AS rm FROM v_billing
            WHERE id = ${resolved.customer.id}
            ORDER BY rm DESC
            LIMIT ${monthsParam}
          )
        )`);
      }

      // When filtering by months we use a high LIMIT to capture all invoices
      // within the window. Otherwise, respect the explicit limit parameter.
      const limitClause = monthsParam ? "LIMIT 500" : `LIMIT ${context.limit}`;

      // Execute the billing query. Results come back ordered newest-first so
      // the most recent invoices are always at the top of the response.
      const rows = await query(
        `SELECT
          due_date,
          amount,
          status,
          reference_month,
          paid_date,
          COALESCE(extra_pageviews_price, 0) AS extra_pageviews_price,
          COALESCE(extra_req_price, 0) AS extra_req_price,
          COALESCE(extra_bw_price, 0) AS extra_bw_price,
          seats_builders,
          COALESCE(seats_builder_cost, 0) AS seats_builder_cost,
          COALESCE(support_price, 0) AS support_price
        FROM v_billing
        WHERE ${conditions.join(" AND ")}
        ORDER BY due_date DESC
        ${limitClause}`,
      );

      // DuckDB returns BigInt for integer columns and Date objects for date
      // columns — neither serializes cleanly to JSON. sanitizeRows converts
      // BigInt → Number and Date → "YYYY-MM-DD" string across the whole result.
      const invoices = sanitizeRows(rows as Record<string, unknown>[]);

      const now = new Date();
      let totalBilled = 0;
      let paidTotal = 0;
      let overdueTotal = 0;
      let pendingTotal = 0;
      let invoicesPaid = 0;
      let invoicesOverdue = 0;
      let lastPaidDate: Date | null = null;
      const dsoValues: number[] = [];

      // Single pass over all invoices to accumulate every metric at once.
      // DSO (Days Sales Outstanding) measures the average delay between the
      // invoice due date and the actual payment date — a proxy for collection
      // efficiency. We only compute it for paid invoices since overdue/pending
      // ones haven't been collected yet.
      for (const inv of invoices) {
        const amount = typeof inv.amount === "number" ? inv.amount : 0;
        const st = String(inv.status ?? "").toLowerCase().trim();
        const dueDate = inv.due_date ? new Date(String(inv.due_date)) : null;
        const paidDate = inv.paid_date ? new Date(String(inv.paid_date)) : null;

        totalBilled += amount;

        if (st === "paid") {
          paidTotal += amount;
          invoicesPaid++;
          if (paidDate && !Number.isNaN(paidDate.getTime())) {
            if (!lastPaidDate || paidDate > lastPaidDate) {
              lastPaidDate = paidDate;
            }
            if (dueDate && !Number.isNaN(dueDate.getTime())) {
              dsoValues.push(daysBetween(dueDate, paidDate));
            }
          }
        } else if (st === "overdue") {
          overdueTotal += amount;
          invoicesOverdue++;
        } else if (st === "pending" || st === "open") {
          pendingTotal += amount;
        }
      }

      const months = new Set<string>();
      for (const inv of invoices) {
        if (inv.reference_month) {
          months.add(toDateOnly(inv.reference_month)?.slice(0, 7) ?? "");
        }
      }
      const refMonthsSorted = [...months].filter(Boolean).sort();
      const oldestMonth = refMonthsSorted[0] || "N/A";
      const newestMonth = refMonthsSorted[refMonthsSorted.length - 1] || "N/A";

      // Divide by the number of distinct reference months (not invoice count)
      // to get a true monthly average — avoids skewing when a customer has
      // multiple invoices in the same month (e.g. adjustments).
      const monthCount = months.size || 1;
      const avgMonthly = round2(totalBilled / monthCount);

      const lastPaymentDaysAgo = lastPaidDate
        ? daysBetween(now, lastPaidDate)
        : null;

      const dsoAvg = dsoValues.length > 0
        ? round2(dsoValues.reduce((a, b) => a + b, 0) / dsoValues.length)
        : null;

      let totalExtraPV = 0;
      let totalExtraRQ = 0;
      let totalExtraBW = 0;
      let totalSeatsCost = 0;
      let totalSupportPrice = 0;
      let latestSeats: number | null = null;

      for (const inv of invoices) {
        totalExtraPV += typeof inv.extra_pageviews_price === "number" ? inv.extra_pageviews_price : 0;
        totalExtraRQ += typeof inv.extra_req_price === "number" ? inv.extra_req_price : 0;
        totalExtraBW += typeof inv.extra_bw_price === "number" ? inv.extra_bw_price : 0;
        totalSeatsCost += typeof inv.seats_builder_cost === "number" ? inv.seats_builder_cost : 0;
        totalSupportPrice += typeof inv.support_price === "number" ? inv.support_price : 0;
        if (latestSeats === null && typeof inv.seats_builders === "number") {
          latestSeats = inv.seats_builders;
        }
      }

      const overageTotal = round2(totalExtraPV + totalExtraRQ + totalExtraBW);
      const overagePercentage = totalBilled > 0
        ? round2((overageTotal / totalBilled) * 100)
        : 0;
      
      // Flag customers where overage charges exceed 40% of total billing —
      // a sign that they've outgrown their current plan and are effectively
      // paying premium rates for usage that a higher tier would cover cheaper.
      const marginBleedAlert = overagePercentage > 40;

      const summaryLines: string[] = [];
      summaryLines.push(
        `Resumo financeiro (${invoices.length} fatura${invoices.length !== 1 ? "s" : ""}, ` +
        `período: ${oldestMonth} a ${newestMonth}):`,
      );
      summaryLines.push(`• Total faturado: R$${round2(totalBilled).toFixed(2)}`);
      summaryLines.push(`• Total pago: R$${round2(paidTotal).toFixed(2)} (${invoicesPaid} fatura${invoicesPaid !== 1 ? "s" : ""})`);
      if (overdueTotal > 0) {
        summaryLines.push(`• Total em atraso: R$${round2(overdueTotal).toFixed(2)} (${invoicesOverdue} fatura${invoicesOverdue !== 1 ? "s" : ""})`);
      } else {
        summaryLines.push(`• Faturas em atraso: 0`);
      }
      summaryLines.push(`• Média mensal: R$${avgMonthly.toFixed(2)}`);
      if (lastPaymentDaysAgo !== null) {
        summaryLines.push(`• Dias desde último pagamento: ${lastPaymentDaysAgo}`);
      }
      if (dsoAvg !== null) {
        summaryLines.push(`• DSO médio: ${dsoAvg} dias`);
      }
      summaryLines.push(`• Overages: R$${overageTotal.toFixed(2)} (${overagePercentage.toFixed(1)}% do total)`);
      if (marginBleedAlert) {
        summaryLines.push(`⚠️ ALERTA: Overages acima de 40% do faturamento — avaliar upgrade de plano.`);
      }
      const summaryText = summaryLines.join("\n");

      const invoiceTableLines: string[] = [
        "reference_month | amount_brl | status | due_date | paid_date | extra_pageviews_brl",
      ];
      for (const inv of invoices) {
        const referenceMonth = toDateOnly(inv.reference_month)?.slice(0, 7) ?? "N/A";
        const amount = typeof inv.amount === "number" ? inv.amount : 0;
        const status = String(inv.status ?? "");
        const dueDate = toDateOnly(inv.due_date) ?? "N/A";
        const paidDate = toDateOnly(inv.paid_date) ?? "N/A";
        const extraPV = typeof inv.extra_pageviews_price === "number" ? inv.extra_pageviews_price : 0;
        invoiceTableLines.push(
          `${referenceMonth} | R$${amount.toFixed(2)} | ${status} | ${dueDate} | ${paidDate} | R$${extraPV.toFixed(2)}`,
        );
      }
      const invoiceTableText = invoiceTableLines.join("\n");

      const appliedFilters: string[] = [];
      if (monthsParam) appliedFilters.push(`months=${monthsParam}`);
      if (statusFilter) appliedFilters.push(`status=${statusFilter}`);
      if (startRefMonth) appliedFilters.push(`start_reference_month=${startRefMonth}`);
      if (endRefMonth) appliedFilters.push(`end_reference_month=${endRefMonth}`);
      if (startDueDate) appliedFilters.push(`start_due_date=${startDueDate}`);
      if (endDueDate) appliedFilters.push(`end_due_date=${endDueDate}`);

      const filterDesc = appliedFilters.length > 0
        ? `Filtros aplicados: ${appliedFilters.join(", ")}.`
        : `Nenhum filtro aplicado (mostrando até ${context.limit} faturas mais recentes).`;

      const llmInstruction =
        `IMPORTANTE: Esta resposta contém ${invoices.length} fatura(s). ${filterDesc} ` +
        `O summary_text foi calculado sobre TODAS as ${invoices.length} fatura(s) retornadas. ` +
        `Se precisar listar valores por mês, copie invoice_table_text literalmente. ` +
        `NÃO remapeie meses, NÃO reordene colunas e NÃO recalcule linhas. ` +
        `Você DEVE exibir TODAS as ${invoices.length} fatura(s) na tabela — NÃO mostre um subconjunto. ` +
        `Copie o summary_text literalmente. NÃO recalcule nenhum valor.`;

      // Wrap the entire return value in sanitize() to catch any remaining
      // BigInt or Date values that slipped through the per-invoice sanitization.
      return sanitize({
        customer: resolved.customer,
        match_type: resolved.match_type,
        total_invoices: invoices.length,
        metrics: {
          average_monthly_billing: avgMonthly,
          last_payment_days_ago: lastPaymentDaysAgo,
          dso_avg_days: dsoAvg,
          total_amount_by_status: {
            paid: round2(paidTotal),
            overdue: round2(overdueTotal),
            pending: round2(pendingTotal),
          },
          total_billed: round2(totalBilled),
          invoices_paid: invoicesPaid,
          invoices_overdue: invoicesOverdue,
        },
        overage: {
          overage_total: overageTotal,
          overage_percentage: overagePercentage,
          overage_breakdown: {
            extra_pageviews: round2(totalExtraPV),
            extra_requests: round2(totalExtraRQ),
            extra_bandwidth: round2(totalExtraBW),
          },
          seats_builders: latestSeats,
          seats_builder_cost: round2(totalSeatsCost),
          support_price: round2(totalSupportPrice),
          margin_bleed_alert: marginBleedAlert,
        },
        invoices,
        invoice_table_text: invoiceTableText,
        summary_text: summaryText,
        _llm_instruction: llmInstruction,
      });
    },
  });
