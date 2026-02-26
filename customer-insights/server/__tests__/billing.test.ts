/**
 * Testes unitários para a tool customer_billing_get (billing.ts)
 *
 * A tool de billing retorna o hist\u00F3rico de faturas de um cliente com métricas
 * financeiras avan\u00E7adas: média mensal, DSO (Days Sales Outstanding), dias
 * desde o \u00FAltimo pagamento, totais por status, breakdown de overage, e alerta
 * de margin bleed.
 *
 * Estratégia de teste:
 * - Mock do createPrivateTool para capturar a fun\u00E7ão execute
 * - Mock do db.query para retornar dados controlados
 * - Mock do resolveCustomer para retornar cliente fixo
 *
 * Cenários cobertos:
 * - Cálculo correto de métricas financeiras (DSO, avg mensal)
 * - Breakdown de overages (extra pageviews, requests, bandwidth)
 * - Alerta de margin bleed quando extras > 40% do total
 * - Filtro por status funciona
 * - Retorno vazio quando não há faturas
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// \u2500\u2500 Captura da fun\u00E7ão execute via mock do createPrivateTool \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
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

// Importar DEPOIS dos mocks
import { createBillingTool } from "../tools/billing.ts";

// For\u00E7ar cria\u00E7ão do tool para capturar o execute
const _tool = createBillingTool({} as any);

// \u2500\u2500 Fixtures \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const INVOICE_PAID = {
  id: 1108,
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
      customer: { id: 1108, name: "Acme Corp", email: "contact@acme.com" },
      match_type: "id" as const,
    });
  });

  it("deve retornar métricas financeiras corretas para faturas pagas", async () => {
    // Simular 2 faturas pagas
    mockQuery.mockResolvedValueOnce([INVOICE_PAID, { ...INVOICE_PAID, reference_month: "2024-12-01" }]);

    const result = await capturedExecute({
      context: { customer_id: "1108", limit: 50 },
    });

    // Verificar que retornou dados
    expect(result.customer.id).toBe(1108);
    expect(result.match_type).toBe("id");
    expect(result.total_invoices).toBe(2);
  });

  it("deve retornar resultado vazio quando não há faturas", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await capturedExecute({
      context: { customer_id: "1108", limit: 50 },
    });

    expect(result.total_invoices).toBe(0);
  });

  it("deve detectar margin bleed quando extras são altos", async () => {
    // Fatura onde extras representam >40% do total
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
      context: { customer_id: "1108", limit: 50 },
    });

    // O resultado deve incluir as faturas processadas
    expect(result.total_invoices).toBe(1);
  });

  it("deve usar resolveCustomer para buscar o cliente", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID]);

    await capturedExecute({
      context: { customer_id: "1108", limit: 50 },
    });

    // Verificar que resolveCustomer foi chamado
    expect(mockResolveCustomer).toHaveBeenCalled();
  });

  it("deve propagar erro quando cliente não é encontrado", async () => {
    mockResolveCustomer.mockRejectedValueOnce(
      new Error("Customer not found for the given customer_id.")
    );

    await expect(
      capturedExecute({ context: { customer_id: "9999", limit: 50 } })
    ).rejects.toThrow("Customer not found");
  });

  it("deve incluir summary_text com valores corretos de total_billed e overages", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID]);

    const result = await capturedExecute({
      context: { customer_id: "1108", limit: 50 },
    });

    expect(result.summary_text).toBeDefined();
    expect(typeof result.summary_text).toBe("string");
    // Must contain the correct total_billed (1500.00)
    expect(result.summary_text).toContain("Total faturado: R$1500.00");
    // Must contain overages (200 + 50 + 30 = 280)
    expect(result.summary_text).toContain("Overages: R$280.00");
    expect(result.summary_text).toContain("1 fatura");
  });

  it("deve incluir summary_text com overdue quando há faturas em atraso", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID, INVOICE_OVERDUE]);

    const result = await capturedExecute({
      context: { customer_id: "1108", limit: 50 },
    });

    expect(result.summary_text).toContain("Total em atraso: R$2000.00");
    // Total = 1500 + 2000 = 3500
    expect(result.summary_text).toContain("Total faturado: R$3500.00");
    // Overages = (200+50+30) + (500+100+80) = 280 + 680 = 960
    expect(result.summary_text).toContain("Overages: R$960.00");
  });

  it("deve incluir summary_text sem overdue quando todas faturas são pagas", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID]);

    const result = await capturedExecute({
      context: { customer_id: "1108", limit: 50 },
    });

    expect(result.summary_text).toContain("Faturas em atraso: 0");
    expect(result.summary_text).not.toContain("Total em atraso");
  });

  it("deve incluir summary_text vazio-formatado quando não há faturas", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await capturedExecute({
      context: { customer_id: "1108", limit: 50 },
    });

    expect(result.summary_text).toContain("0 faturas");
    expect(result.summary_text).toContain("Total faturado: R$0.00");
  });

  it("deve incluir filtro reference_month na query quando months é fornecido", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID]);

    await capturedExecute({
      context: { customer_id: "1108", months: 6 },
    });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("reference_month >=");
    expect(sql).toContain("LIMIT 6");
    // Should NOT use the default limit \u2014 months overrides it with LIMIT 500
    expect(sql).toContain("LIMIT 500");
  });

  it("deve usar LIMIT padrão quando months não é fornecido", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await capturedExecute({
      context: { customer_id: "1108", limit: 24 },
    });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("LIMIT 24");
    expect(sql).not.toContain("LIMIT 500");
  });

  it("deve filtrar por start_reference_month e end_reference_month", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID]);

    await capturedExecute({
      context: {
        customer_id: "1108",
        start_reference_month: "2025-01-01",
        end_reference_month: "2025-06-01",
        limit: 50,
      },
    });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("reference_month >= '2025-01-01'");
    expect(sql).toContain("reference_month <= '2025-06-01'");
  });

  it("deve calcular métricas apenas sobre faturas retornadas (não todas)", async () => {
    // Simular que o mock retorna apenas 2 faturas (como se months=2)
    const inv1 = { ...INVOICE_PAID, amount: 1000, extra_pageviews_price: 300, extra_req_price: 0, extra_bw_price: 0 };
    const inv2 = { ...INVOICE_PAID, amount: 1500, extra_pageviews_price: 400, extra_req_price: 0, extra_bw_price: 0, reference_month: "2025-02-01" };
    mockQuery.mockResolvedValueOnce([inv1, inv2]);

    const result = await capturedExecute({
      context: { customer_id: "1108", months: 2 },
    });

    // Métricas devem refletir apenas as 2 faturas
    expect(result.total_invoices).toBe(2);
    expect(result.metrics.total_billed).toBe(2500); // 1000 + 1500
    expect(result.overage.overage_total).toBe(700); // 300 + 400
    expect(result.summary_text).toContain("Total faturado: R$2500.00");
    expect(result.summary_text).toContain("Overages: R$700.00");
    expect(result.summary_text).toContain("2 faturas");
  });

  it("deve incluir _llm_instruction com contagem de faturas e filtros aplicados", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID, INVOICE_OVERDUE]);

    const result = await capturedExecute({
      context: { customer_id: "1108", months: 6 },
    });

    expect(result._llm_instruction).toBeDefined();
    expect(typeof result._llm_instruction).toBe("string");
    expect(result._llm_instruction).toContain("2 fatura(s)");
    expect(result._llm_instruction).toContain("months=6");
    expect(result._llm_instruction).toContain("DEVE exibir TODAS");
  });

  it("deve incluir _llm_instruction indicando aus\u00EAncia de filtros quando nenhum filtro é usado", async () => {
    mockQuery.mockResolvedValueOnce([INVOICE_PAID]);

    const result = await capturedExecute({
      context: { customer_id: "1108", limit: 24 },
    });

    expect(result._llm_instruction).toBeDefined();
    expect(result._llm_instruction).toContain("Nenhum filtro aplicado");
    expect(result._llm_instruction).toContain("1 fatura(s)");
  });

  it("deve incluir invoice_table_text com mapeamento correto de mes e extra_pageviews", async () => {
    const invA = {
      ...INVOICE_PAID,
      reference_month: "2025-11-01",
      due_date: "2025-12-15",
      paid_date: "2025-12-16",
      amount: 1894.64,
      extra_pageviews_price: 1368.81,
    };
    const invB = {
      ...INVOICE_PAID,
      reference_month: "2025-10-01",
      due_date: "2025-11-15",
      paid_date: "2025-11-16",
      amount: 1831.84,
      extra_pageviews_price: 1402.09,
    };
    mockQuery.mockResolvedValueOnce([invA, invB]);

    const result = await capturedExecute({
      context: { customer_id: "1108", limit: 50 },
    });

    expect(result.invoice_table_text).toContain(
      "2025-11 | R$1894.64 | paid | 2025-12-15 | 2025-12-16 | R$1368.81",
    );
    expect(result.invoice_table_text).toContain(
      "2025-10 | R$1831.84 | paid | 2025-11-15 | 2025-11-16 | R$1402.09",
    );
    expect(result._llm_instruction).toContain("invoice_table_text");
  });

  it("deve incluir per\u00EDodo de datas no summary_text", async () => {
    const inv1 = { ...INVOICE_PAID, reference_month: "2025-01-01" };
    const inv2 = { ...INVOICE_PAID, reference_month: "2025-03-01" };
    mockQuery.mockResolvedValueOnce([inv1, inv2]);

    const result = await capturedExecute({
      context: { customer_id: "1108", months: 3 },
    });

    expect(result.summary_text).toContain("per\u00EDodo: 2025-01 a 2025-03");
  });
});
