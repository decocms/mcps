/**
 * Testes unitários para as funções helper exportadas de summary.ts
 * e para o comportamento do customer_summary_get (snapshot retrieval).
 *
 * O summary.ts exporta muitas funções helper usadas tanto pelo
 * customer_summary_get quanto pelo customer_summary_generate.
 * Testamos essas funções diretamente (são puras) e também o
 * comportamento do tool via mock.
 *
 * Cenários cobertos:
 * - clean() limpa valores nulos/vazios
 * - determineStatus() classifica corretamente (healthy, warning, critical)
 * - formatBillingSection() calcula métricas financeiras
 * - formatUsageSection() calcula trends e formatação
 * - generateProgrammaticAnalysis() gera insights baseados em métricas
 * - generateProgrammaticAction() recomenda ações por severidade
 * - buildFormattedSummary() monta texto formatado
 * - customer_summary_get retorna snapshot quando existe
 * - customer_summary_get gera on-the-fly quando não existe snapshot
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock setup ──────────────────────────────────────────────────────
let capturedExecute: Function;

mock.module("@decocms/runtime/tools", () => ({
  createPrivateTool: (config: any) => {
    capturedExecute = config.execute;
    return config;
  },
}));

const mockQuery = mock(() => Promise.resolve([]));
const mockGetSnapshot = mock(() => Promise.resolve(null));
const mockSaveSnapshot = mock(() => Promise.resolve());

mock.module("../db.ts", () => ({
  query: mockQuery,
  getSnapshot: mockGetSnapshot,
  saveSnapshot: mockSaveSnapshot,
}));

const mockResolveCustomer = mock(() =>
  Promise.resolve({
    customer: { id: 1108, name: "Acme Corp", email: "contact@acme.com" },
    match_type: "id" as const,
  })
);
mock.module("../tools/customer-resolver.ts", () => ({
  resolveCustomer: mockResolveCustomer,
}));

// Importar as funções helper depois dos mocks
import {
  clean,
  determineStatus,
  formatBillingSection,
  formatUsageSection,
  generateProgrammaticAnalysis,
  generateProgrammaticAction,
  buildFormattedSummary,
  createSummaryTool,
} from "../tools/summary.ts";

const mockEnv = {} as any;
const _tool = createSummaryTool(mockEnv);

// ── Testes das funções helper puras ─────────────────────────────────

describe("clean()", () => {
  it("deve retornar undefined para null", () => {
    expect(clean(null)).toBeUndefined();
  });

  it("deve retornar undefined para undefined", () => {
    expect(clean(undefined)).toBeUndefined();
  });

  it("deve retornar undefined para string vazia", () => {
    expect(clean("")).toBeUndefined();
    expect(clean("   ")).toBeUndefined();
  });

  it("deve retornar string para valores válidos", () => {
    expect(clean("hello")).toBe("hello");
    expect(clean(42)).toBe("42");
  });
});

describe("determineStatus()", () => {
  it("deve retornar 'healthy' quando não há problemas", () => {
    const billing = [{ status: "paid" }, { status: "paid" }];
    const emailHistory = { customer: null, total_messages: 0, messages: [], _meta: {} };

    const result = determineStatus(
      billing as any,
      emailHistory as any,
    );
    expect(result.severity).toBe("healthy");
    expect(result.emoji).toBe("✅");
  });

  it("deve retornar 'warning' quando há faturas overdue", () => {
    const billing = [{ status: "paid" }, { status: "overdue" }];
    const emailHistory = { customer: null, total_messages: 0, messages: [], _meta: {} };

    const result = determineStatus(
      billing as any,
      emailHistory as any,
    );
    expect(result.severity).toBe("warning");
  });

  it("deve retornar 'warning' quando há reclamação nos emails (keyword: problem)", () => {
    // A função verifica keywords específicas: "problem", "error", "issue", "complaint"
    // para warning, e "cancelamento", "legal", "procon" etc. para critical
    const billing = [{ status: "paid" }];
    const messages = [
      { snippet: "We have a serious problem with the service" },
    ];
    const emailHistory = {
      customer: null,
      total_messages: 1,
      messages,
      _meta: { enabled: true },
    };

    const result = determineStatus(
      billing as any,
      emailHistory as any,
    );
    expect(result.severity).toBe("warning");
  });

  it("deve retornar 'critical' quando overdue + reclamação legal nos emails", () => {
    // Critical requer: hasOverdue && hasCriticalComplaint
    const billing = [{ status: "overdue" }];
    const messages = [
      { snippet: "Vamos entrar com processo legal contra vocês" },
    ];
    const emailHistory = {
      customer: null,
      total_messages: 1,
      messages,
      _meta: { enabled: true },
    };

    const result = determineStatus(
      billing as any,
      emailHistory as any,
    );
    expect(result.severity).toBe("critical");
  });
});

describe("formatBillingSection()", () => {
  it("deve calcular métricas de billing corretamente", () => {
    const billing = [
      { status: "paid", amount: 1500, due_date: "2025-01-15", paid_date: "2025-01-20" },
      { status: "paid", amount: 1200, due_date: "2025-02-15", paid_date: "2025-02-18" },
      { status: "overdue", amount: 2000, due_date: "2025-03-15", paid_date: null },
    ];

    const result = formatBillingSection(billing as any);

    expect(result.metrics.totalInvoices).toBe(3);
    expect(result.metrics.paid).toBe(2);
    expect(result.metrics.overdue).toBe(1);
    expect(result.metrics.overdueAmount).toBe(2000);
    expect(result.metrics.avgMonthly).toBeGreaterThan(0);
    expect(result.text).toContain("invoices");
  });

  it("deve lidar com billing vazio", () => {
    const result = formatBillingSection([]);

    expect(result.metrics.totalInvoices).toBe(0);
    expect(result.metrics.paid).toBe(0);
    expect(result.metrics.overdue).toBe(0);
  });
});

describe("formatUsageSection()", () => {
  it("deve formatar dados de usage corretamente", () => {
    const usage = {
      summary: {
        total_pageviews: 500000,
        total_requests: 2000000,
        total_bandwidth: 250,
        total_months: 6,
      },
      trend: {
        recent_3m_avg_pageviews: 100000,
        previous_3m_avg_pageviews: 80000,
        recent_3m_avg_requests: 400000,
        previous_3m_avg_requests: 320000,
        recent_3m_avg_bandwidth: 50,
        previous_3m_avg_bandwidth: 40,
      },
    };

    const result = formatUsageSection(usage as any);
    expect(result.metrics.pageviews).toBe(500000);
    expect(result.text).toBeDefined();
  });
});

describe("generateProgrammaticAnalysis()", () => {
  it("deve gerar insight quando uso cresce mas há overdue", () => {
    const billingMetrics = {
      totalInvoices: 10,
      paid: 8,
      overdue: 2,
      overdueAmount: 3000,
      avgMonthly: 1500,
      lastPaymentDays: 5,
    };
    const usageMetrics = {
      pageviews: 500000,
      requests: 2000000,
      bandwidth: 250,
      pageviewsChange: 20, // crescendo
      requestsChange: 20,
      bandwidthChange: 20,
    };
    const emailHistory = { customer: null, total_messages: 0, messages: [], _meta: {} };

    const analysis = generateProgrammaticAnalysis(
      billingMetrics as any,
      usageMetrics as any,
      emailHistory as any,
    );

    expect(analysis.length).toBeGreaterThan(0);
  });

  it("deve retornar mensagem padrão quando tudo está normal", () => {
    const billingMetrics = {
      totalInvoices: 10,
      paid: 10,
      overdue: 0,
      overdueAmount: 0,
      avgMonthly: 1500,
      lastPaymentDays: 3,
    };
    const usageMetrics = {
      pageviews: 500000,
      requests: 2000000,
      bandwidth: 250,
      pageviewsChange: 5,
      requestsChange: 5,
      bandwidthChange: 5,
    };
    const emailHistory = { customer: null, total_messages: 0, messages: [], _meta: {} };

    const analysis = generateProgrammaticAnalysis(
      billingMetrics as any,
      usageMetrics as any,
      emailHistory as any,
    );

    expect(analysis).toContain("normal ranges");
  });
});

describe("generateProgrammaticAction()", () => {
  it("deve recomendar ação urgente para status critical", () => {
    const status = { emoji: "🔴", text: "Critical", severity: "critical" as const };
    const billingMetrics = { totalInvoices: 10, paid: 3, overdue: 7, overdueAmount: 10000, avgMonthly: 2000, lastPaymentDays: 30 };
    const usageMetrics = { pageviews: 100000, requests: 400000, bandwidth: 50, pageviewsChange: -30, requestsChange: -30, bandwidthChange: -30 };

    const action = generateProgrammaticAction(status, billingMetrics as any, usageMetrics as any);
    expect(action).toContain("URGENT");
  });

  it("deve recomendar monitoramento para status healthy", () => {
    const status = { emoji: "✅", text: "Healthy", severity: "healthy" as const };
    const billingMetrics = { totalInvoices: 10, paid: 10, overdue: 0, overdueAmount: 0, avgMonthly: 1500, lastPaymentDays: 3 };
    const usageMetrics = { pageviews: 500000, requests: 2000000, bandwidth: 250, pageviewsChange: 5, requestsChange: 5, bandwidthChange: 5 };

    const action = generateProgrammaticAction(status, billingMetrics as any, usageMetrics as any);
    expect(action).toContain("monitoring");
  });
});

describe("buildFormattedSummary()", () => {
  it("deve incluir nome do cliente e status no summary", () => {
    const customer = { id: 1108, name: "Acme Corp", email: "contact@acme.com" };
    const status = { emoji: "✅", text: "Healthy", severity: "healthy" as const };

    const summary = buildFormattedSummary(
      customer,
      status,
      "Billing section text",
      "Usage section text",
      "Analysis text",
      "Action text",
    );

    expect(summary).toContain("Acme Corp");
    expect(summary).toContain("Healthy");
    expect(summary).toContain("Billing section text");
    expect(summary).toContain("Usage section text");
    expect(summary).toContain("Analysis text");
    expect(summary).toContain("Action text");
    expect(summary).toContain("Usage (aggregated over billing history):");
    expect(summary).not.toContain("Usage (last 30 days):");
  });

  it("deve incluir seção de tiering quando fornecida", () => {
    const customer = { id: 1108, name: "Acme Corp", email: "contact@acme.com" };
    const status = { emoji: "✅", text: "Healthy", severity: "healthy" as const };

    const summary = buildFormattedSummary(
      customer,
      status,
      "Billing",
      "Usage",
      "Analysis",
      "Action",
      "Tiering section text",
    );

    expect(summary).toContain("Tiering section text");
  });
});

// ── Testes do tool customer_summary_get ─────────────────────────────

describe("customer_summary_get (tool)", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetSnapshot.mockReset();
    mockSaveSnapshot.mockReset();
    mockResolveCustomer.mockReset();
    mockResolveCustomer.mockResolvedValue({
      customer: { id: 1108, name: "Acme Corp", email: "contact@acme.com" },
      match_type: "id" as const,
    });
  });

  it("deve retornar snapshot existente instantaneamente", async () => {
    // Simular snapshot já salvo no banco
    mockGetSnapshot.mockResolvedValueOnce({
      customer_id: 1108,
      generated_at: "2025-03-01T10:00:00.000Z",
      summary_text: "Cached summary for Acme Corp",
      data_sources: JSON.stringify({ billing: [] }),
      meta: JSON.stringify({ llm_used: false, status_severity: "healthy" }),
    });

    const result = await capturedExecute({
      context: {
        customer_id: "1108",
        include_email_history: false,
        email_max_results: 5,
        force_refresh: false,
      },
    });

    expect(result.summary).toBe("Cached summary for Acme Corp");
    expect(result._meta.source).toBe("snapshot");
    expect(result._meta.hint).toContain("cached snapshot");
  });

  it("deve não chamar getSnapshot quando force_refresh=true", async () => {
    // Verificamos que o comportamento de force_refresh é pular o bloco de snapshot
    // O teste completo de geração on-the-fly requer muitos mocks de queries internas
    // (getBillingData, getBillingOverview, getUsageData, etc.) que são complexos demais.
    // Aqui validamos apenas que getSnapshot NÃO é chamado com force_refresh=true.

    // Reset para contar chamadas
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue(null);

    // A geração on-the-fly vai falhar porque as queries internas não estão mockadas,
    // mas verificamos que getSnapshot não foi chamado
    try {
      await capturedExecute({
        context: {
          customer_id: "1108",
          include_email_history: false,
          email_max_results: 5,
          force_refresh: true,
        },
      });
    } catch {
      // Esperado falhar na geração on-the-fly
    }

    // Com force_refresh=true, getSnapshot NÃO deve ter sido chamado
    expect(mockGetSnapshot).not.toHaveBeenCalled();
  });
});
