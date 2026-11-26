/**
 * Admin dashboard aggregates (api.fbits.net /dashboard/*): store-wide totals
 * for a period in one call, without paging every order. Requires `apiToken`
 * with the Dashboard permissions.
 */
import { z } from "zod";
import { asResult } from "../lib/admin.ts";
import { createWakeAdminTool } from "../lib/tool.ts";

/** Report → path under /dashboard, as Wake spells it. */
const REPORTS = {
  receita: "receita",
  transacoes: "transacoes",
  ticketMedio: "ticketMedio",
  faturamento: "faturamento",
  graficoFaturamento: "graficofaturamento",
  graficoFormaPagamento: "graficoformapagamento",
  produtos: "produtos",
  novosCompradores: "novoscompradores",
  carrinhoAbandonado: "carrinhoabandonado",
  produtoEstoque: "produtoestoque",
} as const;

const REPORT_NAMES = Object.keys(REPORTS) as [
  keyof typeof REPORTS,
  ...Array<keyof typeof REPORTS>,
];

const day = (what: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .describe(`${what} (YYYY-MM-DD, store's local day).`);

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The same number of days just before the period: Wake's faturamento refuses
 * a call without a comparison period. Explicit comparison dates win.
 */
export function previousPeriod(range: {
  dataInicial: string;
  dataFinal: string;
}): { dataInicialComparativo: string; dataFinalComparativo: string } {
  const start = Date.parse(`${range.dataInicial}T00:00:00Z`);
  const end = Date.parse(`${range.dataFinal}T00:00:00Z`);
  const days = Math.round((end - start) / DAY_MS) + 1;
  return {
    dataInicialComparativo: isoDay(start - days * DAY_MS),
    dataFinalComparativo: isoDay(start - DAY_MS),
  };
}

export const dashboardTool = createWakeAdminTool({
  id: "WAKE_DASHBOARD",
  description:
    "Store-wide sales aggregates for a period from the Wake admin dashboard, in one call. receita / transacoes / ticketMedio: revenue, order count or average ticket per hour/day/week/month/year (tipoAgrupamento), split into captados, pagos, enviados and cancelados. Only captados is by order date (the orders placed in the bucket: it matches WAKE_LIST_ORDERS for the same days); pagos, enviados and cancelados count the orders that reached that state in the bucket, whenever they were placed. faturamento: paid revenue, orders and average ticket against a comparison period (default: the same number of days just before). graficoFaturamento: paid revenue per partner and customer state. graficoFormaPagamento: orders per payment method. produtos: best sellers. novosCompradores, carrinhoAbandonado, produtoEstoque: single indicators; carrinhoAbandonado leaves dataFinal out (one day = dataFinal the next day) and does not match the admin's own abandoned-cart card.",
  inputSchema: z.object({
    report: z.enum(REPORT_NAMES).describe("Which dashboard report."),
    dataInicial: day("Start day"),
    dataFinal: day("End day"),
    tipoAgrupamento: z
      .enum(["Hora", "Dia", "Semana", "Mes", "Ano"])
      .optional()
      .describe("Bucket size, for receita / transacoes / ticketMedio."),
    dataInicialComparativo: day(
      "Comparison start day, for faturamento (default: the period just before)",
    ).optional(),
    dataFinalComparativo: day(
      "Comparison end day, for faturamento (default: the day before dataInicial)",
    ).optional(),
    parceiroId: z.coerce
      .number()
      .int()
      .optional()
      .describe(
        "Only this partner (parceiro), for graficoFaturamento / graficoFormaPagamento / produtos.",
      ),
    isLoja: z
      .boolean()
      .optional()
      .describe("For graficoFaturamento: only the store's own sales."),
  }),
  handler: async ({ report, ...query }, client) => {
    const params =
      report === "faturamento" ? { ...previousPeriod(query), ...query } : query;
    const data = await client.get(`/dashboard/${REPORTS[report]}`, params);
    return { report, ...asResult(data) };
  },
});

export const dashboardTools = [dashboardTool];
