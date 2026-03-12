/**
 * Testes unitários para a tool customer_emails_get (emails.ts)
 *
 * A tool de emails busca e-mails de um cliente via Gmail (Google OAuth).
 * Suporta busca por nome (standard) e por domínio corporativo (domain).
 * A busca por domínio permite encontrar e-mails de qualquer pessoa da mesma
 * empresa, mesmo que não esteja cadastrada na base de contatos.
 *
 * Cenários cobertos:
 * - Busca standard retorna customer_found e mensagens
 * - Busca por domínio retorna contatos do domínio + emails
 * - Retorno quando customer não encontrado
 * - Retorno quando Gmail não está configurado (sem OAuth token)
 * - Busca ambígua retorna candidates
 * - Retorno quando nenhum email encontrado
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

const mockQuery = mock(() => Promise.resolve([]));
mock.module("../db.ts", () => ({
  query: mockQuery,
}));

const mockResolveByDomain = mock(() => Promise.resolve([]));

mock.module("../tools/customer-resolver.ts", () => ({
  resolveCustomersByDomain: mockResolveByDomain,
}));

const { createCustomerEmailsTool } = await import("../tools/emails.ts");

// O tool de emails precisa de env com OAuth configurado
// Simulamos um env mínimo; como não temos token real, esperamos erro de OAuth
const mockEnv = {} as any;
createCustomerEmailsTool(mockEnv);

describe("customer_emails_get", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolveByDomain.mockReset();
    mockQuery.mockResolvedValue([]);
  });

  it("deve retornar customer_found com match_type exact quando nome único encontrado", async () => {
    // Mock query para retornar um único cliente
    mockQuery.mockResolvedValueOnce([
      { name: "Acme Corp", email: "contact@acme.com" },
    ]);

    const result = await capturedExecute({
      context: { customer_name: "Acme Corp", max_results: 10 },
    });

    expect(result.customer_found).toBe(true);
    expect(result.match_type).toBe("exact");
    expect(result.customer.name).toBe("Acme Corp");
    // Sem Gmail = 0 mensagens mas com _meta explicando o motivo
    expect(result.total_messages).toBe(0);
    expect(result._meta).toBeDefined();
  });

  it("deve buscar por domínio e retornar contatos conhecidos", async () => {
    // Busca por domínio: retorna contatos do domínio + tenta Gmail
    const domainContacts = [
      { name: "John", email: "john@acme.com" },
      { name: "Jane", email: "jane@acme.com" },
    ];
    mockResolveByDomain.mockResolvedValueOnce(domainContacts);

    const result = await capturedExecute({
      context: { email_domain: "acme.com", max_results: 10 },
    });

    // Deve ter match_type "domain"
    expect(result.match_type).toBe("domain");
    expect(result.domain_contacts).toBeDefined();
    expect(result.domain_contacts).toHaveLength(2);
  });

  it("deve aceitar domínio com @ no início", async () => {
    mockResolveByDomain.mockResolvedValueOnce([]);

    const result = await capturedExecute({
      context: { email_domain: "@acme.com", max_results: 10 },
    });

    expect(result.match_type).toBe("domain");
    expect(result._meta.domain).toBe("acme.com");
  });

  it("deve retornar customer_found=false quando nenhum customer encontrado", async () => {
    // Query retorna vazio para exact e partial
    mockQuery.mockResolvedValue([]);

    const result = await capturedExecute({
      context: { customer_name: "NonExistent Corp", max_results: 10 },
    });

    expect(result.customer_found).toBe(false);
    expect(result.match_type).toBe("none");
  });

  it("deve retornar resultado vazio para domínio sem contatos e sem Gmail", async () => {
    mockResolveByDomain.mockResolvedValueOnce([]);

    const result = await capturedExecute({
      context: { email_domain: "unknown-domain.xyz", max_results: 10 },
    });

    expect(result.total_messages).toBe(0);
    expect(result.domain_contacts).toEqual([]);
  });

  it("deve priorizar email_domain quando fornecido junto com customer_name", async () => {
    // Quando email_domain está presente, deve usar a branch de domínio
    mockResolveByDomain.mockResolvedValueOnce([]);

    const result = await capturedExecute({
      context: {
        customer_name: "Acme Corp",
        email_domain: "acme.com",
        max_results: 10,
      },
    });

    // email_domain tem prioridade (if emailDomain { ... } vem primeiro)
    expect(result.match_type).toBe("domain");
  });

  it("deve retornar match_type none quando customer_name não fornecido", async () => {
    const result = await capturedExecute({
      context: { max_results: 10 },
    });

    expect(result.customer_found).toBe(false);
    expect(result.match_type).toBe("none");
    expect(result._meta.reason).toContain("customer_name");
  });

  it("deve retornar match_type ambiguous quando múltiplos clientes encontrados", async () => {
    // Mock query para retornar múltiplos clientes
    mockQuery.mockResolvedValueOnce([
      { name: "Acme Corp", email: "contact@acme.com" },
      { name: "Acme Inc", email: "info@acme.com" },
    ]);

    const result = await capturedExecute({
      context: { customer_name: "Acme", max_results: 10 },
    });

    expect(result.customer_found).toBe(false);
    expect(result.match_type).toBe("ambiguous");
    expect(result.candidates).toHaveLength(2);
  });
});
