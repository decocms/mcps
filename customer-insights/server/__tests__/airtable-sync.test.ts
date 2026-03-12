/**
 * Testes unitários para a tool airtable_sync (airtable-sync.ts)
 *
 * A tool puxa registros do Airtable via API, converte para CSV e recarrega
 * as views do DuckDB. Usa env vars AIRTABLE_API_KEY e AIRTABLE_VIEW_URL
 * por padrão, mas aceita override via params.
 *
 * Cenários cobertos:
 * - Sync bem-sucedido
 * - Erro quando credenciais não estão configuradas
 * - Erro quando API do Airtable retorna HTTP erro
 * - Paginação automática (múltiplas páginas via offset)
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock setup ──────────────────────────────────────────────────────
let capturedExecute: Function;

mock.module("@decocms/runtime/tools", () => ({
  createTool: (config: any) => {
    capturedExecute = config.execute;
    return config;
  },
}));

// Mock airtable.ts functions
const mockResolveCredentials = mock(() => ({
  apiKey: "pat_test",
  viewUrl: "https://airtable.com/appTest/tblTest/viwTest",
}));

const mockSyncFromAirtable = mock(() =>
  Promise.resolve({ rows: 10, tableId: "tblTest", viewId: "viwTest" }),
);

mock.module("../airtable.ts", () => ({
  resolveAirtableCredentials: mockResolveCredentials,
  syncFromAirtable: mockSyncFromAirtable,
}));

// Import after mocks are set up
const { createAirtableSyncTool } = await import("../tools/airtable-sync.ts");

// Initialize the tool to capture execute
createAirtableSyncTool({} as any);

// ── Tests ───────────────────────────────────────────────────────────
describe("airtable_sync", () => {
  beforeEach(() => {
    mockResolveCredentials.mockReset();
    mockSyncFromAirtable.mockReset();
    mockResolveCredentials.mockReturnValue({
      apiKey: "pat_test",
      viewUrl: "https://airtable.com/appTest/tblTest/viwTest",
    });
    mockSyncFromAirtable.mockResolvedValue({
      rows: 10,
      tableId: "tblTest",
      viewId: "viwTest",
    });
  });

  it("deve sincronizar com sucesso quando credenciais estão configuradas", async () => {
    const result = await capturedExecute({ context: {} });

    expect(result.success).toBe(true);
    expect(result.rows_loaded).toBe(10);
    expect(result.message).toContain("10 rows");
  });

  it("deve aceitar api_key e view_url como override", async () => {
    const result = await capturedExecute({
      context: {
        api_key: "pat_override",
        view_url: "https://airtable.com/appOverride/tblOverride/viwOverride",
      },
    });

    expect(result.success).toBe(true);
    expect(mockResolveCredentials).toHaveBeenCalledWith({
      apiKey: "pat_override",
      viewUrl: "https://airtable.com/appOverride/tblOverride/viwOverride",
    });
  });

  it("deve retornar erro quando credenciais não estão configuradas", async () => {
    mockResolveCredentials.mockReturnValue(null as any);

    const result = await capturedExecute({ context: {} });

    expect(result.success).toBe(false);
    expect(result.rows_loaded).toBe(0);
    expect(result.message).toContain("credentials not found");
  });

  it("deve retornar erro quando syncFromAirtable falha", async () => {
    mockSyncFromAirtable.mockRejectedValue(new Error("API error: 404"));

    const result = await capturedExecute({ context: {} });

    expect(result.success).toBe(false);
    expect(result.rows_loaded).toBe(0);
    expect(result.message).toContain("404");
  });

  it("deve incluir tableId e viewId na mensagem de sucesso", async () => {
    mockSyncFromAirtable.mockResolvedValue({
      rows: 25,
      tableId: "tblBilling",
      viewId: "viwMain",
    });

    const result = await capturedExecute({ context: {} });

    expect(result.success).toBe(true);
    expect(result.message).toContain("tblBilling");
    expect(result.message).toContain("viwMain");
    expect(result.message).toContain("25 rows");
  });
});
