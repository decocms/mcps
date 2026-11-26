/**
 * Admin / analytics tools — orders via the Wake Admin REST API (api.fbits.net).
 *
 * These are store-level (admin) reads, not per-shopper. They require the
 * `apiToken` configuration (sent as `Authorization: Basic <token>`).
 *
 * Wake dates have no offset: they are the store's local time, both in what
 * the API returns and in the date filters it takes.
 */
import { z } from "zod";
import { asResult } from "../lib/admin.ts";
import { toAnalyticsOrder } from "../lib/order-analytics.ts";
import { createWakeAdminTool } from "../lib/tool.ts";

const DATE_FILTER_KINDS = [
  "DataPedido",
  "DataAprovacao",
  "DataModificacaoStatus",
  "DataAlteracao",
  "DataCriacao",
  "DataStatus",
] as const;

const EXTRA_FIELDS = [
  "ProdutoAtributos",
  "ProdutoEan",
  "ProdutoImagens",
  "ProdutoCategorias",
  "PagamentosInformacoes",
] as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A bare day means the whole day. Wake reads "2026-11-25" as midnight, so a
 * dataFinal without a time would end the range where it starts and return
 * nothing.
 */
export function normalizeDateRange(range: {
  dataInicial?: string;
  dataFinal?: string;
}): { dataInicial?: string; dataFinal?: string } {
  const at = (value: string | undefined, time: string) => {
    const v = value?.trim().replace("T", " ");
    return v && DATE_ONLY.test(v) ? `${v} ${time}` : v;
  };
  return {
    dataInicial: at(range.dataInicial, "00:00:00"),
    dataFinal: at(range.dataFinal, "23:59:59"),
  };
}

/** Whether a page is followed by more: from Wake's total when it sends one, else a full page. */
export function hasMorePages(
  page: number,
  pageSize: number,
  count: number,
  total: number | null,
): boolean {
  return total !== null ? page * pageSize < total : count === pageSize;
}

const dateField = (edge: "Start" | "End") =>
  z
    .string()
    .optional()
    .describe(
      `${edge} date (inclusive), in the store's local time: "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD" (a bare day ${edge === "Start" ? "starts at 00:00:00" : "ends at 23:59:59"}).`,
    );

export const listOrdersTool = createWakeAdminTool({
  id: "WAKE_LIST_ORDERS",
  description:
    'List store orders (admin) within a date range, with filters for status, payment method, customer and SKU. Each order comes complete (items, payment, coupon, address, distribution centers). Paginated: max 50 per page, pages 200+ are refused, so split long ranges into days or hours. Returns `total` (all matches) and `hasMore`. Pass fields="analytics" for a projection without personal data (buyer, documents, street address, card, Pix QR, free-text notes). Use for sales analysis and reporting.',
  inputSchema: z.object({
    dataInicial: dateField("Start"),
    dataFinal: dateField("End"),
    enumTipoFiltroData: z
      .enum(DATE_FILTER_KINDS)
      .optional()
      .describe(
        "Which date the range filters on (default DataPedido). DataAlteracao returns the orders changed in the range: use it for incremental reads. Rows are always sorted by the order date (data), whatever this filter.",
      ),
    direcaoOrdenacao: z
      .enum(["ASC", "DESC"])
      .optional()
      .describe("Sort direction on the order date (default DESC)."),
    situacoesPedido: z
      .string()
      .optional()
      .describe(
        "Comma-separated order status ids to include (see WAKE_LIST_ORDER_STATUSES).",
      ),
    formasPagamento: z
      .string()
      .optional()
      .describe(
        "Comma-separated payment method ids to include (see WAKE_LIST_PAYMENT_METHODS).",
      ),
    listaPedidosIds: z
      .array(z.coerce.number().int())
      .max(50)
      .optional()
      .describe(
        "Fetch these orders (up to 50) in one call; the date filters are ignored.",
      ),
    email: z
      .string()
      .optional()
      .describe("Return only orders placed by this customer email."),
    sku: z
      .string()
      .optional()
      .describe("Return only orders containing this product SKU."),
    valido: z
      .boolean()
      .optional()
      .describe(
        "Filter by valid (true), invalid (false) or all orders (omit).",
      ),
    apenasAssinaturas: z
      .boolean()
      .optional()
      .describe("Return only subscription orders when true."),
    camposAdicionais: z
      .array(z.enum(EXTRA_FIELDS))
      .optional()
      .describe(
        "Extra data per item, e.g. ProdutoCategorias fills each item's categories.",
      ),
    fields: z
      .enum(["full", "analytics"])
      .default("full")
      .describe(
        "full = Wake's order as is; analytics = without personal data (see the tool description).",
      ),
    pagina: z.coerce
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Page number (default 1)."),
    quantidadeRegistros: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(50)
      .describe("Records per page (max 50)."),
  }),
  handler: async ({ fields, listaPedidosIds, ...input }, client) => {
    const { data, total } = await client.getPage("/pedidos", {
      ...input,
      ...normalizeDateRange(input),
      listaPedidosIds: listaPedidosIds?.join(","),
    });
    const orders = Array.isArray(data) ? data : [];
    const items =
      fields === "analytics" ? orders.map(toAnalyticsOrder) : orders;
    return {
      items,
      count: items.length,
      total,
      page: input.pagina,
      pageSize: input.quantidadeRegistros,
      hasMore: hasMorePages(
        input.pagina,
        input.quantidadeRegistros,
        items.length,
        total,
      ),
    };
  },
});

export const getOrderTool = createWakeAdminTool({
  id: "WAKE_GET_ORDER",
  description:
    "Get a single store order (admin) by its order id, including items, totals, customer and payment detail. For several orders, use WAKE_LIST_ORDERS with listaPedidosIds instead of calling this in a loop.",
  inputSchema: z.object({
    pedidoId: z.coerce.number().int().describe("Order id (número do pedido)."),
  }),
  handler: async (input, client) => {
    const data = await client.get(`/pedidos/${input.pedidoId}`);
    return asResult(data);
  },
});

export const getOrderStatusHistoryTool = createWakeAdminTool({
  id: "WAKE_GET_ORDER_STATUS_HISTORY",
  description:
    "Get the status change history (situações) of a store order, for timeline / fulfillment analysis.",
  inputSchema: z.object({
    pedidoId: z.coerce.number().int().describe("Order id (número do pedido)."),
  }),
  handler: async (input, client) => {
    const data = await client.get(
      `/pedidos/${input.pedidoId}/historicoSituacao`,
    );
    return asResult(data);
  },
});

export const listOrderStatusesTool = createWakeAdminTool({
  id: "WAKE_LIST_ORDER_STATUSES",
  description:
    "List all order statuses (situações de pedido) configured in the store. Ids are fixed by the platform; `descricao` is the store's own label, `nome` the platform's group. Use to map status ids before filtering WAKE_LIST_ORDERS.",
  inputSchema: z.object({}),
  handler: async (_input, client) => {
    const data = await client.get("/situacoesPedido");
    return asResult(data);
  },
});

export const listPaymentMethodsTool = createWakeAdminTool({
  id: "WAKE_LIST_PAYMENT_METHODS",
  description:
    "List the store's payment methods (formas de pagamento), to name the formaPagamentoId of an order's payments and to filter WAKE_LIST_ORDERS by payment method.",
  inputSchema: z.object({}),
  handler: async (_input, client) => {
    const data = await client.get("/formasPagamento");
    return asResult(data);
  },
});

export const listOrderOriginsTool = createWakeAdminTool({
  id: "WAKE_LIST_ORDER_ORIGINS",
  description:
    "List the order origins configured in the store (origens de pedido, e.g. Site, App, PDV, Televendas), to name an order's origemPedido.",
  inputSchema: z.object({}),
  handler: async (_input, client) => {
    const data = await client.get("/origensPedido");
    return asResult(data);
  },
});

export const orderTools = [
  listOrdersTool,
  getOrderTool,
  getOrderStatusHistoryTool,
  listOrderStatusesTool,
  listPaymentMethodsTool,
  listOrderOriginsTool,
];
