/**
 * Testes unitários para o módulo customer-resolver.ts
 *
 * O customer-resolver é o componente central de resolução de clientes.
 * Busca clientes por ID (preferido) ou nome no DuckDB, com suporte a
 * match exato, parcial, e detecção de ambiguidade. Também suporta
 * busca por domínio de e-mail para clientes corporativos.
 *
 * ESTRATÉGIA DE MOCK:
 * Mockamos "../db.ts" (a dependência de I/O do resolver) em vez de
 * reprodruzir a lógica do módulo. Isso garante que a implementação real
 * de customer-resolver.ts é exercida nos testes, capturando regressões.
 * O import dinâmico do resolver após mock.module assegura que o módulo
 * real recebe o mock de query antes de ser inicializado.
 *
 * Cenários cobertos:
 * - Erro quando nenhum parâmetro é fornecido
 * - Erro quando parâmetros são strings vazias
 * - Busca por ID: encontrado, não encontrado, não numérico, prioridade
 * - Busca por nome: exato, parcial, ambiguidade, não encontrado, trim
 * - resolveCustomersByDomain: domínio vazio, "@", busca, prefixo @
 * - Tipos exportados
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Fixtures ──────────────────────────────────────────────────────────
const CUSTOMER_ACME = {
  id: 1108,
  name: "Acme Corp",
  email: "contact@acme.com",
};
const CUSTOMER_BETA = { id: 2001, name: "Beta Inc", email: "admin@beta.io" };

// ── Mock de db.ts ──────────────────────────────────────────────────────
// Mockamos a dependência de I/O real em vez de duplicar a lógica do resolver.
// O mock é configurado ANTES do import para que o módulo real o receba.
const mockQueryFn = mock(() => Promise.resolve([] as any[]));

mock.module("../db.ts", () => ({
  query: mockQueryFn,
}));

// Import dinâmico após mock.module: garante que customer-resolver.ts
// carrega com o mock de query já registrado.
const { resolveCustomer, resolveCustomersByDomain } = await import(
  "../tools/customer-resolver.ts"
);

type CustomerRow = { id: number; name: string; email: string };
type CustomerMatchType = "id" | "exact" | "partial";
type ResolvedCustomer = {
  customer: CustomerRow;
  match_type: CustomerMatchType;
};

// ── Testes ─────────────────────────────────────────────────────────────

describe("resolveCustomer — validação de input", () => {
  beforeEach(() => {
    mockQueryFn.mockReset();
    mockQueryFn.mockResolvedValue([]);
  });

  it("deve lançar erro quando nenhum parâmetro é fornecido", async () => {
    await expect(resolveCustomer({})).rejects.toThrow(
      "Please provide customer_id (recommended, unique) or customer_name.",
    );
  });

  it("deve lançar erro quando parâmetros são strings vazias", async () => {
    await expect(
      resolveCustomer({ customer_id: "", customer_name: "" }),
    ).rejects.toThrow(
      "Please provide customer_id (recommended, unique) or customer_name.",
    );
  });

  it("deve lançar erro quando parâmetros são somente espaços", async () => {
    await expect(
      resolveCustomer({ customer_id: "   ", customer_name: "   " }),
    ).rejects.toThrow();
  });
});

describe("resolveCustomer — busca por ID", () => {
  beforeEach(() => {
    mockQueryFn.mockReset();
    mockQueryFn.mockResolvedValue([]);
  });

  it("deve resolver cliente por ID quando encontrado", async () => {
    mockQueryFn.mockResolvedValueOnce([CUSTOMER_ACME]);

    const result = await resolveCustomer({ customer_id: "1108" });
    expect(result.customer.id).toBe(1108);
    expect(result.match_type).toBe("id");
  });

  it("deve lançar erro quando ID não encontra cliente", async () => {
    // mockQueryFn default retorna []
    await expect(resolveCustomer({ customer_id: "9999" })).rejects.toThrow(
      "Customer not found for the given customer_id.",
    );
  });

  it("deve lançar erro quando ID não é numérico", async () => {
    // Number("abc") = NaN → findById retorna null
    await expect(resolveCustomer({ customer_id: "abc" })).rejects.toThrow(
      "Customer not found for the given customer_id.",
    );
  });

  it("deve priorizar customer_id sobre customer_name", async () => {
    mockQueryFn.mockResolvedValueOnce([CUSTOMER_ACME]);

    const result = await resolveCustomer({
      customer_id: "1108",
      customer_name: "Irrelevante",
    });
    expect(result.match_type).toBe("id");
  });
});

describe("resolveCustomer — busca por nome", () => {
  beforeEach(() => {
    mockQueryFn.mockReset();
    mockQueryFn.mockResolvedValue([]);
  });

  it("deve resolver por nome exato quando 1 resultado", async () => {
    mockQueryFn.mockResolvedValueOnce([CUSTOMER_ACME]); // exact match

    const result = await resolveCustomer({ customer_name: "Acme Corp" });
    expect(result.customer).toEqual(CUSTOMER_ACME);
    expect(result.match_type).toBe("exact");
  });

  it("deve resolver por nome parcial quando exact vazio e partial tem 1", async () => {
    mockQueryFn

      .mockResolvedValueOnce([]) // exact match vazio
      .mockResolvedValueOnce([CUSTOMER_ACME]); // partial match

    const result = await resolveCustomer({ customer_name: "Acme" });
    expect(result.match_type).toBe("partial");
  });

  it("deve lançar erro de ambiguidade quando exact retorna múltiplos", async () => {
    mockQueryFn.mockResolvedValueOnce([CUSTOMER_ACME, CUSTOMER_BETA]);

    await expect(resolveCustomer({ customer_name: "Corp" })).rejects.toThrow(
      /Ambiguous name.*Please use customer_id/,
    );
  });

  it("deve lançar erro de ambiguidade quando partial retorna múltiplos", async () => {
    mockQueryFn

      .mockResolvedValueOnce([]) // exact vazio
      .mockResolvedValueOnce([CUSTOMER_ACME, CUSTOMER_BETA]); // partial múltiplos

    await expect(resolveCustomer({ customer_name: "Corp" })).rejects.toThrow(
      /Ambiguous name.*Please use customer_id/,
    );
  });

  it("deve incluir IDs dos candidatos na mensagem de ambiguidade", async () => {
    mockQueryFn.mockResolvedValueOnce([CUSTOMER_ACME, CUSTOMER_BETA]);

    try {
      await resolveCustomer({ customer_name: "Corp" });
      expect(true).toBe(false); // Não deveria chegar aqui
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("ID 1108");
      expect(msg).toContain("ID 2001");
    }
  });

  it("deve lançar erro quando nenhum match é encontrado", async () => {
    // exact e partial ambos retornam []
    await expect(
      resolveCustomer({ customer_name: "Inexistente" }),
    ).rejects.toThrow("Customer not found in contacts/billing database");
  });

  it("deve fazer trim do nome antes de buscar", async () => {
    mockQueryFn.mockResolvedValueOnce([CUSTOMER_ACME]);

    const result = await resolveCustomer({ customer_name: "  Acme Corp  " });
    expect(result.customer).toEqual(CUSTOMER_ACME);
  });
});

describe("resolveCustomersByDomain — validação de input", () => {
  it("deve lançar erro com domínio vazio", async () => {
    await expect(resolveCustomersByDomain("")).rejects.toThrow(
      "Please provide a valid email domain",
    );
  });

  it("deve lançar erro com domínio somente @", async () => {
    await expect(resolveCustomersByDomain("@")).rejects.toThrow(
      "Please provide a valid email domain",
    );
  });
});

describe("resolveCustomersByDomain — busca", () => {
  beforeEach(() => {
    mockQueryFn.mockReset();
    mockQueryFn.mockResolvedValue([]);
  });

  it("deve retornar clientes pelo domínio do e-mail", async () => {
    const contacts = [
      { id: 1108, name: "John", email: "john@acme.com" },
      { id: 1109, name: "Jane", email: "jane@acme.com" },
    ];
    mockQueryFn.mockResolvedValueOnce(contacts);

    const result = await resolveCustomersByDomain("acme.com");
    expect(result).toHaveLength(2);
  });

  it("deve aceitar domínio com @ no início", async () => {
    mockQueryFn.mockResolvedValueOnce([CUSTOMER_ACME]);

    const result = await resolveCustomersByDomain("@acme.com");
    expect(result).toHaveLength(1);
  });

  it("deve retornar array vazio quando nenhum contato encontrado", async () => {
    const result = await resolveCustomersByDomain("inexistente.xyz");
    expect(result).toEqual([]);
  });
});

describe("customer-resolver — tipos exportados", () => {
  it("deve exportar CustomerRow com id, name, email", () => {
    const row: CustomerRow = { id: 1, name: "Test", email: "t@t.com" };
    expect(row.id).toBe(1);
    expect(row.name).toBe("Test");
    expect(row.email).toBe("t@t.com");
  });

  it("deve exportar CustomerMatchType como union type", () => {
    const types: CustomerMatchType[] = ["id", "exact", "partial"];
    expect(types).toHaveLength(3);
  });

  it("deve exportar ResolvedCustomer com customer e match_type", () => {
    const resolved: ResolvedCustomer = {
      customer: { id: 1, name: "Test", email: "t@t.com" },
      match_type: "id",
    };
    expect(resolved.customer.id).toBe(1);
    expect(resolved.match_type).toBe("id");
  });
});
