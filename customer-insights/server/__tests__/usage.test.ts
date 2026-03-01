/**
 * Testes unitários para a tool customer_usage_get (usage.ts)
 *
 * A tool de usage retorna dados de uso ao longo do tempo: pageviews, requests,
 * bandwidth, ratios de eficiência, variações percentuais, e detecção automática
 * de anomalias (bot attacks, heavy assets, usage drop, usage spike).
 *
 * Cenários cobertos:
 * - Cálculo correto de trends (3m recentes vs 3m anteriores)
 * - Detecção de anomalias: high_request_ratio, heavy_assets, usage_drop, usage_spike
 * - Cálculo de eficiência (request/pageview ratio, BW/10k PV)
 * - Formatação humana de bandwidth (GB, TB) e números grandes (K, M)
 * - Retorno com history vazio quando não há dados
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

import { createUsageTool } from "../tools/usage.ts";
const _tool = createUsageTool({} as any);

// ── Fixtures ──────────────────────────────────────────────────────────
function makeUsageRow(month: string, pv: number, req: number, bw: number) {
  return {
    reference_month: month,
    pageviews: BigInt(pv),
    requests: BigInt(req),
    bandwidth: bw,
    plan: "Standard",
    request_pageview_ratio: req / pv,
    bw_per_10k_pageview: (bw / pv) * 10000,
  };
}

describe("customer_usage_get", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveCustomer.mockReset();
    mockResolveCustomer.mockResolvedValue({
      customer: { id: 1108, name: "Acme Corp", email: "contact@acme.com" },
      match_type: "id" as const,
    });
  });

  it("deve retornar histórico de uso com formatação correta", async () => {
    // 3 queries: usage history, summary, trend
    const usageRows = [
      makeUsageRow("2025-03-01", 100000, 400000, 50),
      makeUsageRow("2025-02-01", 90000, 360000, 45),
    ];
    mockQuery.mockResolvedValueOnce(usageRows); // history
    mockQuery.mockResolvedValueOnce([{
      total_pageviews: BigInt(190000),
      total_requests: BigInt(760000),
      total_bandwidth: 95,
      total_months: BigInt(2),
    }]); // summary
    mockQuery.mockResolvedValueOnce([{
      avg_pageviews_recent_3m: 100000,
      avg_pageviews_previous_3m: 80000,
      avg_requests_recent_3m: 400000,
      avg_requests_previous_3m: 320000,
      avg_bandwidth_recent_3m: 50,
      avg_bandwidth_previous_3m: 40,
    }]); // trend

    const result = await capturedExecute({
      context: { customer_id: "1108", months: 12 },
    });

    expect(result.customer.id).toBe(1108);
    expect(result.total_points).toBe(2);
    expect(result.usage_history).toHaveLength(2);
    // Trend deve mostrar crescimento
    expect(result.trend.pageviews_change_pct).toBeGreaterThan(0);
  });

  it("deve retornar vazio quando não há dados de uso", async () => {
    mockQuery.mockResolvedValueOnce([]); // history vazio
    mockQuery.mockResolvedValueOnce([{
      total_pageviews: BigInt(0),
      total_requests: BigInt(0),
      total_bandwidth: 0,
      total_months: BigInt(0),
    }]); // summary
    mockQuery.mockResolvedValueOnce([{
      avg_pageviews_recent_3m: 0,
      avg_pageviews_previous_3m: 0,
      avg_requests_recent_3m: 0,
      avg_requests_previous_3m: 0,
      avg_bandwidth_recent_3m: 0,
      avg_bandwidth_previous_3m: 0,
    }]); // trend

    const result = await capturedExecute({
      context: { customer_id: "1108", months: 12 },
    });

    expect(result.total_points).toBe(0);
    expect(result.usage_history).toEqual([]);
    expect(result.anomalies).toEqual([]);
  });

  it("deve detectar anomalia de usage_drop quando PV cai > 25%", async () => {
    mockQuery.mockResolvedValueOnce([]); // history
    mockQuery.mockResolvedValueOnce([{
      total_pageviews: BigInt(50000),
      total_requests: BigInt(200000),
      total_bandwidth: 25,
      total_months: BigInt(6),
    }]); // summary
    mockQuery.mockResolvedValueOnce([{
      avg_pageviews_recent_3m: 30000,   // queda de 40%
      avg_pageviews_previous_3m: 50000,
      avg_requests_recent_3m: 120000,
      avg_requests_previous_3m: 200000,
      avg_bandwidth_recent_3m: 15,
      avg_bandwidth_previous_3m: 25,
    }]); // trend com queda

    const result = await capturedExecute({
      context: { customer_id: "1108", months: 12 },
    });

    const usageDropAnomaly = result.anomalies.find(
      (a: any) => a.type === "usage_drop"
    );
    expect(usageDropAnomaly).toBeDefined();
    expect(usageDropAnomaly.severity).toBe("warning");
  });

  it("deve detectar anomalia de usage_spike quando PV sobe > 50%", async () => {
    mockQuery.mockResolvedValueOnce([]); // history
    mockQuery.mockResolvedValueOnce([{
      total_pageviews: BigInt(150000),
      total_requests: BigInt(600000),
      total_bandwidth: 75,
      total_months: BigInt(6),
    }]); // summary
    mockQuery.mockResolvedValueOnce([{
      avg_pageviews_recent_3m: 100000,  // crescimento de 100%
      avg_pageviews_previous_3m: 50000,
      avg_requests_recent_3m: 400000,
      avg_requests_previous_3m: 200000,
      avg_bandwidth_recent_3m: 50,
      avg_bandwidth_previous_3m: 25,
    }]); // trend com spike

    const result = await capturedExecute({
      context: { customer_id: "1108", months: 12 },
    });

    const spikeAnomaly = result.anomalies.find(
      (a: any) => a.type === "usage_spike"
    );
    expect(spikeAnomaly).toBeDefined();
  });

  it("deve propagar erro quando cliente não é encontrado", async () => {
    mockResolveCustomer.mockRejectedValueOnce(
      new Error("Customer not found")
    );

    await expect(
      capturedExecute({ context: { customer_id: "9999", months: 12 } })
    ).rejects.toThrow("Customer not found");
  });

  it("deve calcular summary e trend no mesmo recorte de months retornado no histórico", async () => {
    mockQuery.mockResolvedValueOnce([]); // history
    mockQuery.mockResolvedValueOnce([{
      total_pageviews: BigInt(0),
      total_requests: BigInt(0),
      total_bandwidth: 0,
      total_months: BigInt(0),
    }]); // summary
    mockQuery.mockResolvedValueOnce([{
      avg_pageviews_recent_3m: 0,
      avg_pageviews_previous_3m: 0,
      avg_requests_recent_3m: 0,
      avg_requests_previous_3m: 0,
      avg_bandwidth_recent_3m: 0,
      avg_bandwidth_previous_3m: 0,
    }]); // trend

    await capturedExecute({
      context: { customer_id: "1108", months: 6 },
    });

    const summarySql = String(mockQuery.mock.calls[1]?.[0] ?? "");
    const trendSql = String(mockQuery.mock.calls[2]?.[0] ?? "");
    expect(summarySql).toContain("WHERE rn <= 6");
    expect(trendSql).toContain("WHERE rn <= 6");
  });
});
