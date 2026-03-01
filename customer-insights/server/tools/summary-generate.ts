/**
 * Tool: CUSTOMER_SUMMARY_GENERATE (customer_summary_generate)
 *
 * Runs the full executive summary analysis for a customer (billing, usage,
 * email history, tiering, optional LLM enrichment) and saves the result as
 * a snapshot in DuckDB. Subsequent reads via customer_summary_get return
 * the snapshot instantly without re-computing.
 *
 * This is the "heavy" operation (~3-5 s). Call it once, then use
 * customer_summary_get for fast retrieval.
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
  buildContext,
  enrichWithLLM,
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
      customer_id: z.string().optional().describe(
        "Numeric customer ID (recommended, unique). E.g.: 1108. Takes priority over customer_name if provided.",
      ),
      customer_name: z.string().optional().describe(
        "Customer name (exact and partial search). E.g.: Acme Corp. Warning: names are not unique — prefer customer_id.",
      ),
      billing_status: z.string().optional().describe(
        "Status filter for billing in the summary. Options: paid | pending | overdue | open | registered",
      ),
      include_email_history: z.boolean().default(true).describe(
        "If false, does not attempt to fetch emails from Gmail. Default: true",
      ),
      email_max_results: z.number().int().min(1).max(50).default(5).describe(
        "Maximum number of emails considered in the summary (default: 5, max: 50).",
      ),
    }),

    outputSchema: z.object({
      snapshot_saved: z.boolean(),
      customer_id: z.number(),
      generated_at: z.string(),
      summary: z.string(),
      data_sources: z.any(),
      _meta: z.any(),
    }),

    execute: async ({ context }) => {
      const customerId = clean(context.customer_id);
      const customerName = clean(context.customer_name);
      const billingStatus = clean(context.billing_status);

      const resolved = await resolveCustomer({
        customer_id: customerId,
        customer_name: customerName,
      });

      const filtersApplied: SummaryFilters = {
        customer_id: customerId,
        customer_name: customerName,
        resolved_customer_id: resolved.customer.id,
        resolved_customer_name: resolved.customer.name,
        match_type: resolved.match_type,
        billing_status: context.billing_status,
        include_email_history: context.include_email_history,
        email_max_results: context.email_max_results,
      };

      const [billing, billing_overview, usage, email_history, tiering] = await Promise.all([
        getBillingData(resolved.customer.id, billingStatus),
        getBillingOverview(resolved.customer.id),
        getUsageData(resolved.customer.id),
        getEmailHistoryData(
          env,
          resolved.customer,
          context.email_max_results,
          context.include_email_history,
        ),
        getTieringData(resolved.customer.id),
      ]);

      const status = determineStatus(billing, email_history);
      const billingFormatted = formatBillingSection(billing);
      const usageFormatted = formatUsageSection(usage);
      const tieringSection = tiering ? formatTieringSection(tiering) : undefined;

      let analysis = generateProgrammaticAnalysis(
        billingFormatted.metrics,
        usageFormatted.metrics,
        email_history,
        tiering,
      );
      let recommendedAction = generateProgrammaticAction(
        status,
        billingFormatted.metrics,
        usageFormatted.metrics,
      );

      const state = (env as any)?.MESH_REQUEST_CONTEXT?.state ?? (env as any)?.state;
      const llmConfig = state?.LLM_CONFIG;
      let llmUsed = false;
      let llmError: string | undefined;

      if (llmConfig?.api_key) {
        const llmContext = buildContext(
          resolved.customer,
          filtersApplied,
          billing,
          billing_overview,
          usage,
          email_history,
          tiering,
        );

        const enriched = await enrichWithLLM(llmConfig, analysis, recommendedAction, llmContext);

        if (!enriched.error) {
          analysis = enriched.analysis;
          recommendedAction = enriched.action;
          llmUsed = true;
        } else {
          llmError = enriched.error;
        }
      }

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
        llm_used: llmUsed,
        llm_error: llmError,
        status_severity: status.severity,
        ...(llmUsed && llmConfig
          ? { provider: llmConfig.provider ?? "openai", model: llmConfig.model ?? "gpt-4o-mini" }
          : {}),
      };

      // Save snapshot to DuckDB
      const generatedAt = new Date().toISOString();
      await saveSnapshot(resolved.customer.id, summaryText, dataSources, meta);

      return sanitize({
        snapshot_saved: true,
        customer_id: resolved.customer.id,
        generated_at: generatedAt,
        summary: summaryText,
        data_sources: dataSources,
        _meta: meta,
      });
    },
  });
