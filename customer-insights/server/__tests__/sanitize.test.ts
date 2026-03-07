/**
 * Testes unitários para o módulo sanitize.ts
 *
 * O sanitize converte valores que o JSON.stringify não suporta (BigInt, Date)
 * em tipos serializáveis. É usado em praticamente todas as tools como camada
 * de normalização antes de retornar dados ao cliente.
 *
 * Cenários cobertos:
 * - Conversão de BigInt para Number
 * - Conversão de Date para string ISO curta (YYYY-MM-DD)
 * - Tratamento de Date inválida (NaN) → null
 * - Recursão em arrays e objetos aninhados
 * - Passthrough de valores primitivos (string, number, boolean, null, undefined)
 * - sanitizeRows como atalho para array de records
 */

import { describe, it, expect } from "bun:test";
import { sanitize, sanitizeRows } from "../tools/sanitize.ts";

describe("sanitize", () => {
  // ── Tipos primitivos ────────────────────────────────────────────────

  it("deve retornar null intacto", () => {
    expect(sanitize(null)).toBeNull();
  });

  it("deve retornar undefined intacto", () => {
    expect(sanitize(undefined)).toBeUndefined();
  });

  it("deve retornar string intacta", () => {
    expect(sanitize("hello")).toBe("hello");
  });

  it("deve retornar number intacto", () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize(3.14)).toBe(3.14);
    expect(sanitize(0)).toBe(0);
    expect(sanitize(-100)).toBe(-100);
  });

  it("deve retornar boolean intacto", () => {
    expect(sanitize(true)).toBe(true);
    expect(sanitize(false)).toBe(false);
  });

  // ── BigInt → Number ─────────────────────────────────────────────────

  it("deve converter BigInt para Number", () => {
    // DuckDB retorna BigInt para colunas inteiras; JSON.stringify falha com BigInt
    expect(sanitize(BigInt(12345))).toBe(12345);
    expect(sanitize(BigInt(0))).toBe(0);
    expect(sanitize(BigInt(-999))).toBe(-999);
  });

  it("deve converter BigInt grande para Number", () => {
    // BigInts dentro do range seguro de Number devem converter corretamente
    const bigVal = BigInt(Number.MAX_SAFE_INTEGER);
    expect(sanitize(bigVal)).toBe(Number.MAX_SAFE_INTEGER);
  });

  // ── Date → string ISO curta ─────────────────────────────────────────

  it("deve converter Date válida para string YYYY-MM-DD", () => {
    const date = new Date("2025-03-15T10:30:00Z");
    expect(sanitize(date)).toBe("2025-03-15");
  });

  it("deve converter Date inválida para null", () => {
    // Datas inválidas (NaN) não devem quebrar o JSON
    const invalidDate = new Date("invalid-date-string");
    expect(sanitize(invalidDate)).toBeNull();
  });

  // ── Arrays ──────────────────────────────────────────────────────────

  it("deve sanitizar recursivamente elementos de um array", () => {
    const input = [BigInt(1), "hello", new Date("2025-01-01"), null];
    const result = sanitize(input);
    expect(result).toEqual([1, "hello", "2025-01-01", null]);
  });

  it("deve lidar com array vazio", () => {
    expect(sanitize([])).toEqual([]);
  });

  it("deve lidar com arrays aninhados", () => {
    const input = [[BigInt(10)], [BigInt(20)]];
    expect(sanitize(input)).toEqual([[10], [20]]);
  });

  // ── Objetos ─────────────────────────────────────────────────────────

  it("deve sanitizar recursivamente valores de um objeto", () => {
    const input = {
      id: BigInt(1108),
      name: "Acme Corp",
      created: new Date("2024-06-01"),
      active: true,
      notes: null,
    };
    const result = sanitize(input);
    expect(result).toEqual({
      id: 1108,
      name: "Acme Corp",
      created: "2024-06-01",
      active: true,
      notes: null,
    });
  });

  it("deve lidar com objeto vazio", () => {
    expect(sanitize({})).toEqual({});
  });

  it("deve sanitizar objetos profundamente aninhados", () => {
    const input = {
      level1: {
        level2: {
          value: BigInt(42),
          date: new Date("2025-12-25"),
        },
      },
    };
    const result = sanitize(input);
    expect(result).toEqual({
      level1: {
        level2: {
          value: 42,
          date: "2025-12-25",
        },
      },
    });
  });

  it("deve sanitizar objetos contendo arrays com BigInts", () => {
    const input = {
      items: [BigInt(1), BigInt(2), BigInt(3)],
      meta: { count: BigInt(3) },
    };
    const result = sanitize(input);
    expect(result).toEqual({
      items: [1, 2, 3],
      meta: { count: 3 },
    });
  });
});

describe("sanitizeRows", () => {
  it("deve sanitizar um array de registros (Records)", () => {
    const rows = [
      { id: BigInt(1), name: "Alice", created: new Date("2024-01-01") },
      { id: BigInt(2), name: "Bob", created: new Date("2024-02-15") },
    ];
    const result = sanitizeRows(rows);
    expect(result).toEqual([
      { id: 1, name: "Alice", created: "2024-01-01" },
      { id: 2, name: "Bob", created: "2024-02-15" },
    ]);
  });

  it("deve lidar com array vazio de registros", () => {
    expect(sanitizeRows([])).toEqual([]);
  });

  it("deve lidar com registros contendo valores mistos", () => {
    const rows = [
      {
        amount: BigInt(15000),
        status: "paid",
        due_date: new Date("2025-05-01"),
        notes: null,
        rate: 3.14,
      },
    ];
    const result = sanitizeRows(rows);
    expect(result).toEqual([
      {
        amount: 15000,
        status: "paid",
        due_date: "2025-05-01",
        notes: null,
        rate: 3.14,
      },
    ]);
  });
});
