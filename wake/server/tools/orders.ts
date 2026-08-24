/**
 * Admin / analytics tools — orders via the Wake Admin REST API (api.fbits.net).
 *
 * These are store-level (admin) reads, not per-shopper. They require the
 * `apiToken` configuration (sent as `Authorization: Basic <token>`).
 */
import { z } from "zod";
import { createWakeAdminTool } from "../lib/tool.ts";

const DATE_FILTER_KINDS = [
  "DataPedido",
  "DataAprovacao",
  "DataModificacaoStatus",
  "DataAlteracao",
  "DataCriacao",
] as const;

/** REST list endpoints return arrays; wrap them so tools always return an object. */
function asResult(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return { items: data, count: data.length };
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return { result: data };
}

export const listOrdersTool = createWakeAdminTool({
  id: "WAKE_LIST_ORDERS",
  description:
    "List store orders (admin) in descending order within a date range, with filters for status, payment method, customer and SKU. Use for sales analysis and reporting. Paginated (max 50 per page).",
  inputSchema: z.object({
    dataInicial: z
      .string()
      .optional()
      .describe(
        'Start date (inclusive). Format "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss".',
      ),
    dataFinal: z
      .string()
      .optional()
      .describe(
        'End date (inclusive). Format "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss".',
      ),
    enumTipoFiltroData: z
      .enum(DATE_FILTER_KINDS)
      .optional()
      .describe("Which date the range filters on (default DataPedido)."),
    situacoesPedido: z
      .string()
      .optional()
      .describe(
        "Comma-separated order status ids to include (see WAKE_LIST_ORDER_STATUSES).",
      ),
    formasPagamento: z
      .string()
      .optional()
      .describe("Comma-separated payment method ids to include."),
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
  handler: async (input, client) => {
    const data = await client.get("/pedidos", input);
    return asResult(data);
  },
});

export const getOrderTool = createWakeAdminTool({
  id: "WAKE_GET_ORDER",
  description:
    "Get a single store order (admin) by its order id, including items, totals, customer and payment detail.",
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
    "List all order statuses (situações de pedido) configured in the store. Use to map status ids/names before filtering WAKE_LIST_ORDERS.",
  inputSchema: z.object({}),
  handler: async (_input, client) => {
    const data = await client.get("/situacoesPedido");
    return asResult(data);
  },
});

export const orderTools = [
  listOrdersTool,
  getOrderTool,
  getOrderStatusHistoryTool,
  listOrderStatusesTool,
];
