import { describe, expect, it } from "bun:test";
import { previousPeriod } from "./dashboard.ts";

describe("previousPeriod", () => {
  it("compares a day with the day before", () => {
    expect(
      previousPeriod({ dataInicial: "2026-11-25", dataFinal: "2026-11-25" }),
    ).toEqual({
      dataInicialComparativo: "2026-11-24",
      dataFinalComparativo: "2026-11-24",
    });
  });

  it("compares a period with as many days just before, across months", () => {
    expect(
      previousPeriod({ dataInicial: "2026-11-01", dataFinal: "2026-11-26" }),
    ).toEqual({
      dataInicialComparativo: "2026-10-06",
      dataFinalComparativo: "2026-10-31",
    });
  });
});
