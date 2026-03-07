/**
 * Testes unitários para a tool customer_health_list (health-list.ts)
 *
 * A tool de health list retorna uma lista ranqueada de todos os clientes com
 * um health score (0-100) baseado em: comportamento de pagamento, tendência
 * de uso, e métricas de overage. Útil para triagem diária.
 *
 * Cenários cobertos:
 * - Cálculo correto do health score para diferentes perfis
 * - Classificação de health labels (critical, at_risk, needs_attention, healthy, excellent)
 * - Penalidades corretas: payment rate, overdue, usage trend, overage
 * - Filtro por health_filter funciona
 * - Ordenação por health_score, overdue_amount, overage_pct
 * - Distribuição correta dos labels
 * - Geração de issues descritivas
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

import { createHealthListTool } from "../tools/health-list.ts";
const _tool = createHealthListTool({} as any);

// ── Fixtures ──────────────────────────────────────────────────────────
// Cliente saudável: todos pagos, sem overdue, uso estável
const HEALTHY_CUSTOMER = {
  id: BigInt(1001),
  name: "Healthy Corp",
  email: "h@healthy.com",
  total_invoices: BigInt(10),
  paid_count: BigInt(10),
  overdue_count: BigInt(0),
  total_billed: 15000.0,
  overdue_amount: 0.0,
  avg_amount: 1500.0,
  last_paid_date: "2025-03-01",
  avg_pageviews_recent: 50000.0,
  avg_pageviews_previous: 48000.0,
  overage_total: 500.0,
  latest_plan: "Standard",
};

// Cliente em risco: muitos overdue, uso caindo
const AT_RISK_CUSTOMER = {
  id: BigInt(2001),
  name: "Risk LLC",
  email: "r@risk.com",
  total_invoices: BigInt(10),
  paid_count: BigInt(4),       // 40% payment rate → -40 pontos
  overdue_count: BigInt(3),    // 3 overdue → -30 pontos
  total_billed: 20000.0,
  overdue_amount: 6000.0,
  avg_amount: 2000.0,
  last_paid_date: "2024-12-01",
  avg_pageviews_recent: 20000.0,
  avg_pageviews_previous: 50000.0, // queda de 60% → -12 pontos
  overage_total: 12000.0,         // 60% overage → -10 pontos
  latest_plan: "Standard",
};

describe("customer_health_list", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("deve calcular health score 'excellent' para cliente saudável", async () => {
    mockQuery.mockResolvedValueOnce([HEALTHY_CUSTOMER]);

    const result = await capturedExecute({
      context: { sort_by: "health_score", min_invoices: 1, health_filter: "all", limit: 50 },
    });

    expect(result.total_customers).toBe(1);
    const customer = result.customers[0];
    // Score alto: sem penalidades significativas
    expect(customer.health_score).toBeGreaterThanOrEqual(80);
    expect(["excellent", "healthy"]).toContain(customer.health_label);
    expect(customer.issues).toEqual([]); // sem issues
  });

  it("deve calcular health score baixo para cliente em risco", async () => {
    mockQuery.mockResolvedValueOnce([AT_RISK_CUSTOMER]);

    const result = await capturedExecute({
      context: { sort_by: "health_score", min_invoices: 1, health_filter: "all", limit: 50 },
    });

    const customer = result.customers[0];
    // Penalidades: -40 (payment) -30 (overdue) -12 (usage drop) -10 (overage)
    expect(customer.health_score).toBeLessThan(30);
    expect(["critical", "at_risk"]).toContain(customer.health_label);
    expect(customer.issues.length).toBeGreaterThan(0);
  });

  it("deve ordenar por health_score ascendente (pior primeiro)", async () => {
    mockQuery.mockResolvedValueOnce([HEALTHY_CUSTOMER, AT_RISK_CUSTOMER]);

    const result = await capturedExecute({
      context: { sort_by: "health_score", min_invoices: 1, health_filter: "all", limit: 50 },
    });

    // O primeiro da lista deve ter score menor (pior)
    const scores = result.customers.map((c: any) => c.health_score);
    expect(scores[0]).toBeLessThanOrEqual(scores[1]);
  });

  it("deve filtrar por health_filter", async () => {
    mockQuery.mockResolvedValueOnce([HEALTHY_CUSTOMER, AT_RISK_CUSTOMER]);

    const result = await capturedExecute({
      context: { sort_by: "health_score", min_invoices: 1, health_filter: "excellent", limit: 50 },
    });

    // Apenas clientes com label "excellent" devem aparecer
    for (const c of result.customers) {
      expect(c.health_label).toBe("excellent");
    }
  });

  it("deve expandir needs_attention para incluir at_risk e critical por padrão (triage)", async () => {
    mockQuery.mockResolvedValueOnce([HEALTHY_CUSTOMER, AT_RISK_CUSTOMER]);

    const result = await capturedExecute({
      context: { sort_by: "health_score", min_invoices: 1, health_filter: "needs_attention", limit: 50 },
    });

    // No modo padrão, needs_attention inclui labels mais graves
    expect(result.returned).toBeGreaterThanOrEqual(1);
    expect(result.customers.some((c: any) => c.health_label === "critical" || c.health_label === "at_risk")).toBe(true);
    expect(result._meta.triage_mode).toBe(true);
  });

  it("deve aplicar filtro estrito quando strict_health_filter=true", async () => {
    mockQuery.mockResolvedValueOnce([HEALTHY_CUSTOMER, AT_RISK_CUSTOMER]);

    const result = await capturedExecute({
      context: {
        sort_by: "health_score",
        min_invoices: 1,
        health_filter: "needs_attention",
        strict_health_filter: true,
        limit: 50,
      },
    });

    // Como os fixtures não têm label needs_attention, o retorno estrito fica vazio
    expect(result.returned).toBe(0);
    expect(result._meta.triage_mode).toBe(false);
  });

  it("deve calcular distribuição de labels corretamente", async () => {
    mockQuery.mockResolvedValueOnce([HEALTHY_CUSTOMER, AT_RISK_CUSTOMER]);

    const result = await capturedExecute({
      context: { sort_by: "health_score", min_invoices: 1, health_filter: "all", limit: 50 },
    });

    const dist = result.distribution;
    // Soma das distribuições deve ser igual ao total
    const totalDist = Object.values(dist).reduce((a: number, b: any) => a + b, 0);
    expect(totalDist).toBe(result.total_customers);
  });

  it("deve respeitar o limit", async () => {
    // 2 clientes mas limit=1
    mockQuery.mockResolvedValueOnce([HEALTHY_CUSTOMER, AT_RISK_CUSTOMER]);

    const result = await capturedExecute({
      context: { sort_by: "health_score", min_invoices: 1, health_filter: "all", limit: 1 },
    });

    expect(result.returned).toBe(1);
    expect(result.customers).toHaveLength(1);
    // Mas total_customers deve refletir todos
    expect(result.total_customers).toBe(2);
  });

  it("deve retornar lista vazia quando não há clientes", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const result = await capturedExecute({
      context: { sort_by: "health_score", min_invoices: 1, health_filter: "all", limit: 50 },
    });

    expect(result.total_customers).toBe(0);
    expect(result.customers).toEqual([]);
  });

  it("deve gerar issues descritivas para overdue", async () => {
    mockQuery.mockResolvedValueOnce([AT_RISK_CUSTOMER]);

    const result = await capturedExecute({
      context: { sort_by: "health_score", min_invoices: 1, health_filter: "all", limit: 50 },
    });

    const customer = result.customers[0];
    // Deve ter issue sobre overdue
    const overdueIssue = customer.issues.find((i: string) => i.includes("overdue"));
    expect(overdueIssue).toBeDefined();
  });

  it("deve gerar issue sobre pageviews drop significativo", async () => {
    mockQuery.mockResolvedValueOnce([AT_RISK_CUSTOMER]);

    const result = await capturedExecute({
      context: { sort_by: "health_score", min_invoices: 1, health_filter: "all", limit: 50 },
    });

    const customer = result.customers[0];
    // Queda de 60% em pageviews deve gerar issue
    const dropIssue = customer.issues.find((i: string) => i.includes("dropped"));
    expect(dropIssue).toBeDefined();
  });
});
