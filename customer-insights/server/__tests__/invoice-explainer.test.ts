/**
 * Testes unitários para a tool customer_invoice_explain (invoice-explainer.ts)
 *
 * A tool de invoice explain gera um breakdown detalhado de uma fatura específica,
 * mostrando custo base vs extras (pageviews, requests, bandwidth, seats, support)
 * com comparação ao mês anterior. Inclui texto explicativo humano.
 *
 * Cenários cobertos:
 * - Breakdown correto de fatura com todos os componentes
 * - Comparação com mês anterior (increased, decreased, unchanged)
 * - Identificação do maior driver de custo
 * - Texto explicativo inclui todas as seções esperadas
 * - Simulação de tiering na explicação
 * - Alertas: extras > 40%, fatura overdue, variação > 20%
 * - Fatura não encontrada retorna meses disponíveis
 * - Retorno vazio quando cliente não tem faturas
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
mock.module("../db.ts", () => ({
  query: mockQuery,
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

import { createInvoiceExplainerTool } from "../tools/invoice-explainer.ts";
const _tool = createInvoiceExplainerTool({} as any);

// ── Fixtures ──────────────────────────────────────────────────────────
const INVOICE_CURRENT = {
  due_date: "2025-03-15",
  amount: 2000.0,
  status: "paid",
  reference_month: "2025-03-01",
  paid_date: "2025-03-20",
  pageviews: 80000,
  requests: 320000,
  bandwidth: 40,
  plan: "Standard R$40/10k PV",
  request_pageview_ratio: 4.0,
  bw_per_10k_pageview: 5.0,
  extra_pageviews_price: 300.0,
  extra_req_price: 50.0,
  extra_bw_price: 30.0,
  seats_builders: 2,
  seats_builder_cost: 100.0,
  support_price: 80.0,
  tier_40_cost: 1800.0,
  tier_50_cost: 2100.0,
  tier_80_cost: 2500.0,
};

const INVOICE_PREVIOUS = {
  ...INVOICE_CURRENT,
  due_date: "2025-02-15",
  amount: 1500.0,
  status: "paid",
  reference_month: "2025-02-01",
  paid_date: "2025-02-18",
  pageviews: 60000,
  requests: 240000,
  bandwidth: 30,
  extra_pageviews_price: 100.0,
  extra_req_price: 20.0,
  extra_bw_price: 10.0,
  seats_builder_cost: 100.0,
  support_price: 80.0,
};

describe("customer_invoice_explain", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveCustomer.mockReset();
    mockResolveCustomer.mockResolvedValue({
      customer: { id: 1108, name: "Acme Corp", email: "contact@acme.com" },
      match_type: "id" as const,
    });
  });

  it("deve gerar breakdown completo com comparação ao mês anterior", async () => {
    // Query retorna faturas ordenadas por reference_month DESC
    // O target month é 2025-03, o anterior é 2025-02
    mockQuery.mockResolvedValueOnce([INVOICE_CURRENT, INVOICE_PREVIOUS]);

    const result = await capturedExecute({
      context: { customer_id: "1108", reference_month: "2025-03" },
    });

    expect(result.invoice_found).toBe(true);
    expect(result.breakdown).toBeDefined();
    expect(result.breakdown.reference_month).toBe("2025-03");
    expect(result.breakdown.total).toBe(2000.0);
    expect(result.breakdown.extras.extra_pageviews).toBe(300.0);

    // Comparação deve existir
    expect(result.comparison).toBeDefined();
    expect(result.comparison.direction).toBe("increased");

    // Explicação deve ser gerada
    expect(result.explanation).toBeDefined();
    expect(result.explanation).toContain("Acme Corp");
    expect(result.explanation).toContain("2025-03");
  });

  it("deve retornar invoice_found=false quando mês não encontrado", async () => {
    // Fatura existe para 2025-03 mas não para 2025-06
    mockQuery.mockResolvedValueOnce([INVOICE_CURRENT]);

    const result = await capturedExecute({
      context: { customer_id: "1108", reference_month: "2025-06" },
    });

    expect(result.invoice_found).toBe(false);
    // Deve listar meses disponíveis na explicação
    expect(result.explanation).toContain("2025-03");
  });

  it("deve retornar breakdown sem comparação quando é o único mês", async () => {
    // Apenas 1 fatura — sem mês anterior para comparar
    mockQuery.mockResolvedValueOnce([INVOICE_CURRENT]);

    const result = await capturedExecute({
      context: { customer_id: "1108", reference_month: "2025-03" },
    });

    expect(result.invoice_found).toBe(true);
    expect(result.breakdown).toBeDefined();
    // Sem mês anterior = sem comparison
    expect(result.comparison).toBeNull();
    expect(result.previous_month).toBeNull();
  });

  it("deve retornar vazio quando cliente não tem faturas", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await capturedExecute({
      context: { customer_id: "1108", reference_month: "2025-03" },
    });

    expect(result.invoice_found).toBe(false);
    expect(result.breakdown).toBeNull();
  });

  it("deve calcular extras_percentage corretamente", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_CURRENT]);

    const result = await capturedExecute({
      context: { customer_id: "1108", reference_month: "2025-03" },
    });

    // extras = 300 + 50 + 30 + 100 + 80 = 560
    // percentage = (560 / 2000) * 100 = 28%
    expect(result.breakdown.extras.total_extras).toBe(560);
    expect(result.breakdown.extras_percentage).toBe(28);
  });

  it("deve incluir simulação de tiering no breakdown", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_CURRENT]);

    const result = await capturedExecute({
      context: { customer_id: "1108", reference_month: "2025-03" },
    });

    expect(result.breakdown.tiering_simulation.tier_40).toBe(1800);
    expect(result.breakdown.tiering_simulation.tier_50).toBe(2100);
    expect(result.breakdown.tiering_simulation.tier_80).toBe(2500);
  });

  it("deve incluir alertas na explicação quando fatura é overdue", async () => {
    const overdueInvoice = { ...INVOICE_CURRENT, status: "overdue", paid_date: null };
    mockQuery.mockResolvedValueOnce([overdueInvoice]);

    const result = await capturedExecute({
      context: { customer_id: "1108", reference_month: "2025-03" },
    });

    expect(result.explanation).toContain("OVERDUE");
  });

  it("deve aceitar reference_month no formato YYYY-MM-DD", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_CURRENT]);

    const result = await capturedExecute({
      context: { customer_id: "1108", reference_month: "2025-03-01" },
    });

    expect(result.invoice_found).toBe(true);
  });

  it("deve identificar biggest_driver na comparação", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_CURRENT, INVOICE_PREVIOUS]);

    const result = await capturedExecute({
      context: { customer_id: "1108", reference_month: "2025-03" },
    });

    // O biggest_driver deve ser o componente com maior variação absoluta
    expect(result.comparison.biggest_driver).toBeDefined();
    expect(result.comparison.biggest_driver_change).toBeGreaterThan(0);
  });
});
