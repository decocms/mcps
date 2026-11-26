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

export const dashboardTool = createWakeAdminTool({
  id: "WAKE_DASHBOARD",
  description:
    "Store-wide sales aggregates for a period from the Wake admin dashboard, in one call. receita / transacoes / ticketMedio: revenue, order count or average ticket per hour/day/week/month/year (tipoAgrupamento), each split into captados, pagos, enviados and cancelados. faturamento: revenue, orders and average ticket with an optional comparison period. graficoFaturamento: paid revenue per partner and customer state. graficoFormaPagamento: orders per payment method. produtos: best sellers. novosCompradores, carrinhoAbandonado (abandoned carts: a count only), produtoEstoque: single indicators. Wake does not document which statuses each bucket counts: check against WAKE_LIST_ORDERS before relying on it.",
  inputSchema: z.object({
    report: z.enum(REPORT_NAMES).describe("Which dashboard report."),
    dataInicial: day("Start day"),
    dataFinal: day("End day"),
    tipoAgrupamento: z
      .enum(["Hora", "Dia", "Semana", "Mes", "Ano"])
      .optional()
      .describe("Bucket size, for receita / transacoes / ticketMedio."),
    dataInicialComparativo: day(
      "Comparison start day, for faturamento",
    ).optional(),
    dataFinalComparativo: day("Comparison end day, for faturamento").optional(),
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
    const data = await client.get(`/dashboard/${REPORTS[report]}`, query);
    return { report, ...asResult(data) };
  },
});

export const dashboardTools = [dashboardTool];
