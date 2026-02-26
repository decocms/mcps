/**
 * Testes unitários para a tool upload_csv (upload-csv.ts)
 *
 * A tool de upload CSV baixa um CSV de uma URL pública, salva no disco,
 * e recarrega a view DuckDB correspondente. Suporta URLs normais,
 * Google Drive, e S3 presigned URLs.
 *
 * Cenários cobertos:
 * - Upload bem-sucedido de billing CSV
 * - Upload bem-sucedido de contacts CSV
 * - Conversão de link Google Drive para formato de download direto
 * - Erro quando URL é vazia
 * - Erro quando download falha (HTTP 404)
 * - Erro quando CSV baixado está vazio
 * - Erro propagado do saveCsv/reloadView
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

const mockSaveCsv = mock(() => "/mock/path/billing.csv");
const mockReloadView = mock(() => Promise.resolve(42));

mock.module("../db.ts", () => ({
  saveCsv: mockSaveCsv,
  reloadView: mockReloadView,
}));

import { createUploadCsvTool } from "../tools/upload-csv.ts";
const _tool = createUploadCsvTool({} as any);

// ── Mock do fetch global ────────────────────────────────────────────
const originalFetch = globalThis.fetch;

describe("upload_csv", () => {
  beforeEach(() => {
    mockSaveCsv.mockReset();
    mockReloadView.mockReset();
    mockSaveCsv.mockReturnValue("/mock/path/billing.csv");
    mockReloadView.mockResolvedValue(42);
  });

  afterEach(() => {
    // Restaurar fetch original após cada teste
    globalThis.fetch = originalFetch;
  });

  it("deve fazer upload e retornar sucesso para billing CSV", async () => {
    // Mock do fetch para retornar CSV válido
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("id,name\n1,Acme", { status: 200 }))
    ) as any;

    const result = await capturedExecute({
      context: { data_type: "billing", csv_url: "https://example.com/data.csv" },
    });

    expect(result.success).toBe(true);
    expect(result.data_type).toBe("billing");
    expect(result.rows_loaded).toBe(42);
    expect(result.message).toContain("successfully");
  });

  it("deve retornar erro quando URL é vazia", async () => {
    const result = await capturedExecute({
      context: { data_type: "billing", csv_url: "" },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("empty");
  });

  it("deve retornar erro quando URL é apenas espaços", async () => {
    const result = await capturedExecute({
      context: { data_type: "billing", csv_url: "   " },
    });

    expect(result.success).toBe(false);
  });

  it("deve retornar erro quando download falha (HTTP 404)", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Not Found", { status: 404, statusText: "Not Found" }))
    ) as any;

    const result = await capturedExecute({
      context: { data_type: "billing", csv_url: "https://example.com/nonexistent.csv" },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("404");
  });

  it("deve retornar erro quando CSV baixado está vazio", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("", { status: 200 }))
    ) as any;

    const result = await capturedExecute({
      context: { data_type: "billing", csv_url: "https://example.com/empty.csv" },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("empty");
  });

  it("deve converter link Google Drive para formato de download", async () => {
    // O tool detecta URLs do Google Drive e converte para download direto
    let fetchedUrl = "";
    globalThis.fetch = mock((url: string) => {
      fetchedUrl = url;
      return Promise.resolve(new Response("id,name\n1,Test", { status: 200 }));
    }) as any;

    await capturedExecute({
      context: {
        data_type: "contacts",
        csv_url: "https://drive.google.com/file/d/ABC123/view",
      },
    });

    // Deve ter convertido para URL de download direto
    expect(fetchedUrl).toContain("drive.google.com/uc?export=download&id=ABC123");
  });

  it("deve usar filename correto baseado no data_type", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("id,name,email\n1,Test,t@t.com", { status: 200 }))
    ) as any;

    await capturedExecute({
      context: { data_type: "contacts", csv_url: "https://example.com/contacts.csv" },
    });

    // saveCsv deve ser chamado com "contacts.csv"
    expect(mockSaveCsv).toHaveBeenCalledWith("contacts.csv", expect.any(String));
  });

  it("deve propagar erro do reloadView gracefully", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("invalid csv data", { status: 200 }))
    ) as any;

    mockReloadView.mockRejectedValueOnce(new Error("CSV parse error"));

    const result = await capturedExecute({
      context: { data_type: "billing", csv_url: "https://example.com/bad.csv" },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("CSV parse error");
  });
});
