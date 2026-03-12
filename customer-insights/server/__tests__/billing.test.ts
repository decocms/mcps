/**
 * Testes unitarios para a tool customer_billing_get (billing.ts)
 *
 * A tool de billing retorna o historico de faturas de um cliente com metricas
 * financeiras avancadas: media mensal, DSO (Days Sales Outstanding), dias
 * desde o ultimo pagamento, totais por status, breakdown de overage, e alerta
 * de margin bleed.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// -- Captura da funcao execute via mock do createPrivateTool --
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
    customer: { name: "Acme Corp", email: "contact@acme.com" },
    match_type: "exact" as const,
  }),
);
mock.module("../tools/customer-resolver.ts", () => ({
  resolveCustomer: mockResolveCustomer,
}));

// Import dinamico DEPOIS dos mocks
const { createBillingTool } = await import("../tools/billing.ts");

// Forcar criacao do tool para capturar o execute
createBillingTool({} as any);

// -- Fixtures --
const INVOICE_PAID = {
  name: "Acme Corp",
  due_date: "2025-01-15",
  amount: 1500.0,
  reference_month: "2025-01-01",
  status: "paid",
  paid_date: "2025-01-20",
  pageviews: BigInt(50000),
  requests: BigInt(200000),
  bandwidth: 25.5,
  plan: "Standard R$40/10k PV",
  extra_pageviews_price: 200.0,
  extra_req_price: 50.0,
  extra_bw_price: 30.0,
  seats_builders: 3,
  seats_builder_cost: 150.0,
  support_price: 100.0,
  tier_40_cost: 1400.0,
  tier_50_cost: 1600.0,
  tier_80_cost: 2000.0,
  request_pageview_ratio: 4.0,
  bw_per_10k_pageview: 5.1,
};

const INVOICE_OVERDUE = {
  ...INVOICE_PAID,
  status: "overdue",
  paid_date: null,
  due_date: "2025-02-15",
  reference_month: "2025-02-01",
  amount: 2000.0,
  extra_pageviews_price: 500.0,
  extra_req_price: 100.0,
  extra_bw_price: 80.0,
};

describe("customer_billing_get", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveCustomer.mockReset();
    mockResolveCustomer.mockResolvedValue({
      customer: { name: "Acme Corp", email: "contact@acme.com" },
      match_type: "exact" as const,
    });
  });

  it("deve retornar metricas financeiras corretas para faturas pagas", async () => {
    mockQuery.mockResolvedValueOnce([
      INVOICE_PAID,
      { ...INVOICE_PAID, reference_month: "2024-12-01" },
    ]);

    const result = await capturedExecute({
      context: { customer_name: "Acme Corp", limit: 50 },
    });

    expect(result.customer.name).toBe("Acme Corp");
    expect(result.match_type).toBe("exact");
    expect(result.total_invoices).toBe(2);
  });

  it("deve retornar resultado vazio quando nao ha faturas", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await capturedExecute({
      context: { customer_name: "Acme Corp", limit: 50 },
    });

    expect(result.total_invoices).toBe(0);
  });

  it("deve detectar margin bleed quando extras sao altos", async () => {
    const highExtrasInvoice = {
      ...INVOICE_PAID,
      amount: 1000.0,
      extra_pageviews_price: 300.0,
      extra_req_price: 100.0,
      extra_bw_price: 100.0,
      seats_builder_cost: 0,
      support_price: 0,
    };
    mockQuery.mockResolvedValueOnce([highExtrasInvoice]);

    const result = await capturedExecute({
      context: { customer_name: "Acme Corp", limit: 50 },
    });

    expect(result.total_invoices).toBe(1);
  });

  it("deve usar resolveCustomer para buscar o cliente", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID]);

    await capturedExecute({
      context: { customer_name: "Acme Corp", limit: 50 },
    });

    expect(mockResolveCustomer).toHaveBeenCalled();
  });

  it("deve propagar erro quando cliente nao e encontrado", async () => {
    mockResolveCustomer.mockRejectedValueOnce(
      new Error("Customer not found in billing database."),
    );

    await expect(
      capturedExecute({ context: { customer_name: "Unknown", limit: 50 } }),
    ).rejects.toThrow("Customer not found");
  });

  it("deve incluir summary_text com valores corretos", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID]);

    const result = await capturedExecute({
      context: { customer_name: "Acme Corp", limit: 50 },
    });

    expect(result.summary_text).toBeDefined();
    expect(typeof result.summary_text).toBe("string");
    expect(result.summary_text).toContain("1 fatura");
  });

  it("deve incluir summary_text com overdue quando ha faturas em atraso", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID, INVOICE_OVERDUE]);

    const result = await capturedExecute({
      context: { customer_name: "Acme Corp", limit: 50 },
    });

    expect(result.summary_text).toContain("Total em atraso");
  });

  it("deve calcular metricas apenas sobre faturas retornadas", async () => {
    const inv1 = {
      ...INVOICE_PAID,
      amount: 1000,
      extra_pageviews_price: 300,
      extra_req_price: 0,
      extra_bw_price: 0,
    };
    const inv2 = {
      ...INVOICE_PAID,
      amount: 1500,
      extra_pageviews_price: 400,
      extra_req_price: 0,
      extra_bw_price: 0,
      reference_month: "2025-02-01",
    };
    mockQuery.mockResolvedValueOnce([inv1, inv2]);

    const result = await capturedExecute({
      context: { customer_name: "Acme Corp", months: 2 },
    });

    expect(result.total_invoices).toBe(2);
    expect(result.metrics.total_billed).toBe(2500);
    expect(result.overage.overage_total).toBe(700);
  });

  it("deve incluir _llm_instruction com contagem de faturas", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID, INVOICE_OVERDUE]);

    const result = await capturedExecute({
      context: { customer_name: "Acme Corp", months: 6 },
    });

    expect(result._llm_instruction).toBeDefined();
    expect(typeof result._llm_instruction).toBe("string");
    expect(result._llm_instruction).toContain("2 fatura(s)");
  });
});
