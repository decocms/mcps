/**
 * Testes unitários para a tool airtable_sync (airtable-sync.ts)
 *
 * A tool puxa registros do Airtable via API, converte para CSV e recarrega
 * as views do DuckDB. Requer AIRTABLE_CONFIG no state do MCP.
 *
 * Cenários cobertos:
 * - Sync bem-sucedido de billing
 * - Sync bem-sucedido de contacts
 * - Sync de ambas as tabelas (tables: "all")
 * - Erro quando AIRTABLE_CONFIG não está configurado
 * - Erro quando API do Airtable retorna HTTP erro
 * - Paginação automática (múltiplas páginas via offset)
 * - Conversão correta de records para CSV (escape de vírgulas e aspas)
 * - Tabela vazia (zero registros)
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ── Mock setup ──────────────────────────────────────────────────────
let capturedExecute: Function;

mock.module("@decocms/runtime/tools", () => ({
  createPrivateTool: (config: any) => {
    capturedExecute = config.execute;
    return config;
  },
}));

const mockSaveCsv = mock(() => "/mock/data/billing.csv");
const mockReloadView = mock(() => Promise.resolve(10));

mock.module("../db.ts", () => ({
  saveCsv: mockSaveCsv,
  reloadView: mockReloadView,
}));

import { createAirtableSyncTool } from "../tools/airtable-sync.ts";

// ── Helpers ─────────────────────────────────────────────────────────
const VALID_CONFIG = {
  api_key: "pat_test_key",
  base_id: "appTest123",
  billing_table: "billing",
  contacts_table: "contacts",
};

const makeEnv = (config?: typeof VALID_CONFIG | null) => ({
  state: config !== null ? { AIRTABLE_CONFIG: config } : {},
});

const airtableResponse = (
  records: Record<string, unknown>[],
  offset?: string,
) => ({
  records: records.map((fields, i) => ({
    id: `rec${i}`,
    fields,
    createdTime: "2025-01-01T00:00:00.000Z",
  })),
  ...(offset ? { offset } : {}),
});

const originalFetch = globalThis.fetch;

// ── Tests ───────────────────────────────────────────────────────────
describe("airtable_sync", () => {
  beforeEach(() => {
    mockSaveCsv.mockReset();
    mockReloadView.mockReset();
    mockSaveCsv.mockReturnValue("/mock/data/billing.csv");
    mockReloadView.mockResolvedValue(10);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("deve sincronizar billing com sucesso", async () => {
    const env = makeEnv(VALID_CONFIG);
    createAirtableSyncTool(env as any);

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            airtableResponse([{ ID: "1108", Valor: "R$1000,00", Status: "paid" }]),
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as any;

    const result = await capturedExecute({ context: { tables: "billing" } });

    expect(result.success).toBe(true);
    expect(result.synced).toHaveLength(1);
    expect(result.synced[0].table).toBe("billing");
    expect(result.synced[0].rows_loaded).toBe(10);
    expect(result.message).toContain("billing: 10 rows");
  });

  it("deve sincronizar contacts com sucesso", async () => {
    const env = makeEnv(VALID_CONFIG);
    createAirtableSyncTool(env as any);

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            airtableResponse([{ ID: "1108", Nome: "Paula Piva", Email: "paula@example.com" }]),
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as any;

    const result = await capturedExecute({ context: { tables: "contacts" } });

    expect(result.success).toBe(true);
    expect(result.synced[0].table).toBe("contacts");
    expect(mockSaveCsv).toHaveBeenCalledWith("contacts.csv", expect.any(String));
    expect(mockReloadView).toHaveBeenCalledWith("contacts");
  });

  it("deve sincronizar billing e contacts quando tables='all'", async () => {
    const env = makeEnv(VALID_CONFIG);
    createAirtableSyncTool(env as any);

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify(airtableResponse([{ ID: "1108", Nome: "Test" }])),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as any;

    const result = await capturedExecute({ context: { tables: "all" } });

    expect(result.success).toBe(true);
    expect(result.synced).toHaveLength(2);
    expect(result.synced.map((s: any) => s.table)).toEqual(["billing", "contacts"]);
    expect(mockSaveCsv).toHaveBeenCalledTimes(2);
    expect(mockReloadView).toHaveBeenCalledTimes(2);
  });

  it("deve retornar erro quando AIRTABLE_CONFIG não está configurado", async () => {
    const env = makeEnv(null);
    createAirtableSyncTool(env as any);

    const result = await capturedExecute({ context: { tables: "all" } });

    expect(result.success).toBe(false);
    expect(result.synced).toHaveLength(0);
    expect(result.message).toContain("AIRTABLE_CONFIG not set");
  });

  it("deve retornar erro quando API do Airtable responde com erro HTTP", async () => {
    const env = makeEnv(VALID_CONFIG);
    createAirtableSyncTool(env as any);

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
          statusText: "Not Found",
        }),
      ),
    ) as any;

    const result = await capturedExecute({ context: { tables: "billing" } });

    expect(result.success).toBe(false);
    expect(result.message).toContain("404");
  });

  it("deve paginar automaticamente quando Airtable retorna offset", async () => {
    const env = makeEnv(VALID_CONFIG);
    createAirtableSyncTool(env as any);

    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      const isFirstPage = callCount === 1;
      return Promise.resolve(
        new Response(
          JSON.stringify(
            airtableResponse(
              [{ ID: String(callCount), Nome: `Cliente ${callCount}` }],
              isFirstPage ? "next_page_token" : undefined,
            ),
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }) as any;

    const result = await capturedExecute({ context: { tables: "billing" } });

    expect(result.success).toBe(true);
    // fetch deve ter sido chamado 2 vezes (página 1 + página 2)
    expect(callCount).toBe(2);
  });

  it("deve incluir token de autorização no header da requisição", async () => {
    const env = makeEnv(VALID_CONFIG);
    createAirtableSyncTool(env as any);

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock((url: string, opts: RequestInit) => {
      capturedHeaders = (opts?.headers ?? {}) as Record<string, string>;
      return Promise.resolve(
        new Response(JSON.stringify(airtableResponse([])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as any;

    await capturedExecute({ context: { tables: "billing" } });

    expect(capturedHeaders["Authorization"]).toBe(`Bearer ${VALID_CONFIG.api_key}`);
  });

  it("deve montar URL correta com baseId e nome da tabela", async () => {
    const env = makeEnv({ ...VALID_CONFIG, billing_table: "Faturas" });
    createAirtableSyncTool(env as any);

    let fetchedUrl = "";
    globalThis.fetch = mock((url: string) => {
      fetchedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify(airtableResponse([])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as any;

    await capturedExecute({ context: { tables: "billing" } });

    expect(fetchedUrl).toContain(`/v0/${VALID_CONFIG.base_id}/`);
    expect(fetchedUrl).toContain("Faturas");
  });

  it("deve escapar vírgulas e aspas nos valores do CSV", async () => {
    const env = makeEnv(VALID_CONFIG);
    createAirtableSyncTool(env as any);

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            airtableResponse([
              { ID: "1", Nome: 'Cliente "VIP"', Email: "a,b@test.com" },
            ]),
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as any;

    await capturedExecute({ context: { tables: "contacts" } });

    const csvContent = mockSaveCsv.mock.calls[0][1] as string;
    // Aspas internas devem ser escapadas como ""
    expect(csvContent).toContain('"Cliente ""VIP"""');
    // Valores com vírgula devem ser envoltos em aspas
    expect(csvContent).toContain('"a,b@test.com"');
  });

  it("deve salvar CSV vazio sem erro quando tabela não tem registros", async () => {
    const env = makeEnv(VALID_CONFIG);
    createAirtableSyncTool(env as any);

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(airtableResponse([])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ) as any;

    const result = await capturedExecute({ context: { tables: "billing" } });

    // Deve ter chamado saveCsv com string vazia
    expect(mockSaveCsv).toHaveBeenCalledWith("billing.csv", "");
    expect(result.success).toBe(true);
  });
});
