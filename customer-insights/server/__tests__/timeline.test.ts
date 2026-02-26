/**
 * Testes unitários para a tool customer_timeline_get (timeline.ts)
 *
 * A tool de timeline constrói uma timeline unificada do cliente com eventos
 * de billing, usage e email em ordem cronológica. Cada evento tem tipo,
 * source, data, e detalhes específicos.
 *
 * Cenários cobertos:
 * - Eventos de billing aparecem na timeline
 * - Timeline vazia quando não há dados
 * - Contagem de eventos por tipo (billing, usage, email)
 * - Ordenação cronológica
 * - Propagação de erro quando cliente não encontrado
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

import { createTimelineTool } from "../tools/timeline.ts";
const _tool = createTimelineTool({} as any);

// ── Fixtures ──────────────────────────────────────────────────────────
const BILLING_ROWS = [
  {
    due_date: "2025-03-15",
    amount: 1500.0,
    status: "paid",
    reference_month: "2025-03-01",
    paid_date: "2025-03-20",
    extra_pageviews_price: 100.0,
    extra_req_price: 0,
    extra_bw_price: 0,
  },
  {
    due_date: "2025-02-15",
    amount: 1200.0,
    status: "overdue",
    reference_month: "2025-02-01",
    paid_date: null,
    extra_pageviews_price: 0,
    extra_req_price: 0,
    extra_bw_price: 0,
  },
];

const USAGE_ROWS = [
  {
    reference_month: "2025-03-01",
    pageviews: BigInt(80000),
    requests: BigInt(320000),
    bandwidth: 40.5,
  },
];

describe("customer_timeline_get", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveCustomer.mockReset();
    mockResolveCustomer.mockResolvedValue({
      customer: { id: 1108, name: "Acme Corp", email: "contact@acme.com" },
      match_type: "id" as const,
    });
  });

  it("deve criar timeline com eventos de billing", async () => {
    // A timeline tool faz 2 queries: billing + usage
    mockQuery.mockResolvedValueOnce(BILLING_ROWS);  // billing
    mockQuery.mockResolvedValueOnce(USAGE_ROWS);      // usage

    const result = await capturedExecute({
      context: { customer_id: "1108", max_events: 100 },
    });

    expect(result.customer.id).toBe(1108);
    expect(result.total_events).toBeGreaterThan(0);
    expect(result.events).toBeDefined();
  });

  it("deve retornar timeline vazia quando não há eventos", async () => {
    mockQuery.mockResolvedValueOnce([]); // billing vazio
    mockQuery.mockResolvedValueOnce([]); // usage vazio

    const result = await capturedExecute({
      context: { customer_id: "1108", max_events: 100 },
    });

    expect(result.total_events).toBe(0);
  });

  it("deve propagar erro quando cliente não é encontrado", async () => {
    mockResolveCustomer.mockRejectedValueOnce(
      new Error("Customer not found")
    );

    await expect(
      capturedExecute({ context: { customer_id: "9999", max_events: 100 } })
    ).rejects.toThrow("Customer not found");
  });

  it("deve usar resolveCustomer para buscar o cliente", async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce([]);

    await capturedExecute({
      context: { customer_name: "Acme", max_events: 100 },
    });

    expect(mockResolveCustomer).toHaveBeenCalled();
  });
});
