/**
 * Testes unitarios para a tool customer_risk_score (risk-score.ts)
 *
 * A tool de risk score calcula um score de risco de churn (0-10) ponderado
 * por 5 fatores: atraso de pagamento (0.3), tendencia de uso (0.2),
 * frequencia de overdue (0.2), % de overage (0.15), gap de tiering (0.15).
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

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

import { createRiskScoreTool } from "../tools/risk-score.ts";
const _tool = createRiskScoreTool({} as any);

function makePerfectInvoice(month: string) {
  return {
    amount: 1000,
    status: "paid",
    due_date: "2025-01-15",
    paid_date: "2025-01-15",
    reference_month: month,
    extra_pageviews_price: 0,
    extra_req_price: 0,
    extra_bw_price: 0,
    pageviews: 50000,
    tier_40_cost: 1000,
    tier_50_cost: 1100,
    tier_80_cost: 1200,
  };
}

function makeProblematicInvoice(month: string) {
  return {
    amount: 2000,
    status: "overdue",
    due_date: "2025-01-15",
    paid_date: null,
    reference_month: month,
    extra_pageviews_price: 500,
    extra_req_price: 200,
    extra_bw_price: 100,
    pageviews: 30000,
    tier_40_cost: 1200,
    tier_50_cost: 1400,
    tier_80_cost: 1800,
  };
}

function makeHighOverageNoTierGapInvoice(month: string) {
  return {
    amount: 2000,
    status: "paid",
    due_date: "2025-01-15",
    paid_date: "2025-01-15",
    reference_month: month,
    extra_pageviews_price: 1100,
    extra_req_price: 300,
    extra_bw_price: 0,
    pageviews: 70000,
    tier_40_cost: 2100,
    tier_50_cost: 2200,
    tier_80_cost: 2600,
  };
}

describe("customer_risk_score", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveCustomer.mockReset();
    mockResolveCustomer.mockResolvedValue({
      customer: { id: 1108, name: "Acme Corp", email: "contact@acme.com" },
      match_type: "id" as const,
    });
  });

  it("deve retornar score 0 e profile stable para cliente sem dados", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await capturedExecute({
      context: { customer_id: "1108" },
    });

    expect(result.risk_score).toBe(0);
    expect(result.risk_profile).toBe("stable");
    expect(result.issues).toContain("No billing data available");
  });

  it("deve calcular score baixo para cliente com pagamentos em dia", async () => {
    const invoices = Array.from({ length: 6 }, (_, i) =>
      makePerfectInvoice(`2025-0${i + 1}-01`)
    );
    mockQuery.mockResolvedValueOnce(invoices);

    const result = await capturedExecute({
      context: { customer_id: "1108" },
    });

    expect(result.risk_score).toBeLessThanOrEqual(2);
    expect(["stable", "moderate"]).toContain(result.risk_profile);
  });

  it("deve calcular score alto para cliente problematico", async () => {
    const invoices = Array.from({ length: 6 }, (_, i) =>
      makeProblematicInvoice(`2025-0${i + 1}-01`)
    );
    mockQuery.mockResolvedValueOnce(invoices);

    const result = await capturedExecute({
      context: { customer_id: "1108" },
    });

    expect(result.risk_score).toBeGreaterThan(3);
    expect(["elevated", "high", "critical"]).toContain(result.risk_profile);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.recommended_actions.length).toBeGreaterThan(0);
  });

  it("deve ter exatamente 5 fatores de risco no resultado", async () => {
    mockQuery.mockResolvedValueOnce([makePerfectInvoice("2025-01-01")]);

    const result = await capturedExecute({
      context: { customer_id: "1108" },
    });

    expect(result.factors).toHaveLength(5);
    const names = result.factors.map((f: any) => f.name);
    expect(names).toContain("payment_delay");
    expect(names).toContain("usage_trend");
    expect(names).toContain("overdue_frequency");
    expect(names).toContain("overage_percentage");
    expect(names).toContain("tiering_gap");
  });

  it("deve somar pesos dos fatores em 1.0", async () => {
    mockQuery.mockResolvedValueOnce([makePerfectInvoice("2025-01-01")]);

    const result = await capturedExecute({
      context: { customer_id: "1108" },
    });

    const totalWeight = result.factors.reduce(
      (sum: number, f: any) => sum + f.weight,
      0,
    );
    expect(totalWeight).toBeCloseTo(1.0, 2);
  });

  it("deve gerar issue sobre overdue quando ha faturas nao pagas", async () => {
    mockQuery.mockResolvedValueOnce([makeProblematicInvoice("2025-01-01")]);

    const result = await capturedExecute({
      context: { customer_id: "1108" },
    });

    const overdueIssue = result.issues.find((i: string) => i.includes("unpaid"));
    expect(overdueIssue).toBeDefined();
  });

  it("deve gerar action sobre tiering quando gap e alto", async () => {
    const invoices = Array.from({ length: 6 }, (_, i) =>
      makeProblematicInvoice(`2025-0${i + 1}-01`)
    );
    mockQuery.mockResolvedValueOnce(invoices);

    const result = await capturedExecute({
      context: { customer_id: "1108" },
    });

    const tieringAction = result.recommended_actions.find(
      (a: string) => a.includes("tiering"),
    );
    expect(tieringAction).toBeDefined();
  });

  it("nao deve sugerir upgrade quando overage eh alto mas nao existe tier mais barato", async () => {
    const invoices = Array.from({ length: 6 }, (_, i) =>
      makeHighOverageNoTierGapInvoice(`2025-0${i + 1}-01`)
    );
    mockQuery.mockResolvedValueOnce(invoices);

    const result = await capturedExecute({
      context: { customer_id: "1108" },
    });

    expect(result.issues.some((i: string) => i.includes("High overage"))).toBe(true);
    expect(
      result.recommended_actions.some((a: string) =>
        a.includes("Suggest plan upgrade")
      ),
    ).toBe(false);
    expect(
      result.recommended_actions.some((a: string) =>
        a.includes("no cheaper tier identified")
      ),
    ).toBe(true);
  });

  it("deve propagar erro quando cliente nao e encontrado", async () => {
    mockResolveCustomer.mockRejectedValueOnce(new Error("Customer not found"));

    await expect(
      capturedExecute({ context: { customer_id: "9999" } }),
    ).rejects.toThrow("Customer not found");
  });
});
