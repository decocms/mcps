/**
 * Tool: CUSTOMER_SUMMARY_GENERATE (customer_summary_generate)
 *
 * Runs the full executive summary analysis for a customer (billing, usage,
 * email history, tiering) and saves the result as a snapshot in DuckDB.
 * Subsequent reads via customer_summary_get return the snapshot instantly.
 *
 * This is the "heavy" operation. Call it once, then use customer_summary_get
 * for fast retrieval.
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { saveSnapshot } from "../db.ts";
import { resolveCustomer } from "./customer-resolver.ts";
import { sanitize } from "./sanitize.ts";
import {
  clean,
  getBillingData,
  getBillingOverview,
  getUsageData,
  getEmailHistoryData,
  getTieringData,
  determineStatus,
  formatBillingSection,
  formatUsageSection,
  formatTieringSection,
  generateProgrammaticAnalysis,
  generateProgrammaticAction,
  buildFormattedSummary,
  type SummaryFilters,
} from "./summary.ts";

export const createSummaryGenerateTool = (env: Env) =>
  createPrivateTool({
    id: "customer_summary_generate",
    description:
      "Generates and saves a complete executive summary snapshot for a customer. " +
      "Runs the full analysis (billing, usage, email, tiering, optional LLM). " +
      "Use customer_summary_get afterwards to retrieve the snapshot instantly.",

    inputSchema: z.object({
      customer_name: z

        .string()

        .describe("Customer name (exact or partial search). E.g.: Acme Corp."),
      billing_status: z

        .string()

        .optional()

        .describe(
          "Status filter for billing in the summary. Options: paid | pending | overdue | open | registered",
        ),
      include_email_history: z

        .boolean()

        .default(true)

        .describe(
          "If false, does not attempt to fetch emails from Gmail. Default: true",
        ),
      email_max_results: z

        .number()

        .int()

        .min(1)

        .max(50)

        .default(5)

        .describe(
          "Maximum number of emails considered in the summary (default: 5, max: 50).",
        ),
    }),

    outputSchema: z.object({
      snapshot_saved: z.boolean(),
      customer_name: z.string(),
      generated_at: z.string(),
      summary: z.string(),
      data_sources: z.any(),
      _meta: z.any(),
    }),

    execute: async ({ context }) => {
      const customerName = clean(context.customer_name);
      const billingStatus = clean(context.billing_status);

      const resolved = await resolveCustomer({
        customer_name: customerName,
      });

      const filtersApplied: SummaryFilters = {
        customer_name: customerName,
        resolved_customer_name: resolved.customer.name,
        match_type: resolved.match_type,
        billing_status: context.billing_status,
        include_email_history: context.include_email_history,
        email_max_results: context.email_max_results,
      };

      const [billing, billing_overview, usage, email_history, tiering] =
        await Promise.all([
          getBillingData(resolved.customer.name, billingStatus),
          getBillingOverview(resolved.customer.name),
          getUsageData(resolved.customer.name),
          getEmailHistoryData(
            env,
            resolved.customer,
            context.email_max_results,
            context.include_email_history,
          ),
          getTieringData(resolved.customer.name),
        ]);

      const status = determineStatus(billing, email_history);
      const billingFormatted = formatBillingSection(billing);
      const usageFormatted = formatUsageSection(usage);
      const tieringSection = tiering
        ? formatTieringSection(tiering)
        : undefined;

      const analysis = generateProgrammaticAnalysis(
        billingFormatted.metrics,
        usageFormatted.metrics,
        email_history,
        tiering,
      );
      const recommendedAction = generateProgrammaticAction(
        status,
        billingFormatted.metrics,
        usageFormatted.metrics,
      );

      const summaryText = buildFormattedSummary(
        resolved.customer,
        status,
        billingFormatted.text,
        usageFormatted.text,
        analysis,
        recommendedAction,
        tieringSection,
      );

      const dataSources = {
        customer: resolved.customer,
        match_type: resolved.match_type,
        filters_applied: filtersApplied,
        billing_overview,
        billing,
        usage,
        email_history,
        tiering,
      };

      const meta = {
        status_severity: status.severity,
      };

      // Save snapshot to DuckDB
      const generatedAt = new Date().toISOString();
      await saveSnapshot(
        resolved.customer.name,
        summaryText,
        dataSources,
        meta,
      );

      return sanitize({
        snapshot_saved: true,
        customer_name: resolved.customer.name,
        generated_at: generatedAt,
        summary: summaryText,
        data_sources: dataSources,
        _meta: meta,
      });
    },
  });
