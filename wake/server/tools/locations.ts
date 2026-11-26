/**
 * Admin reads of where orders are fulfilled: distribution centers and
 * physical stores. An order item names the distribution center that shipped
 * it; a physical store points at its own distribution center, which is how a
 * ship-from-store order is told apart from one shipped by the main warehouse.
 */
import { z } from "zod";
import { asResult } from "../lib/admin.ts";
import { createWakeAdminTool } from "../lib/tool.ts";

export const listDistributionCentersTool = createWakeAdminTool({
  id: "WAKE_LIST_DISTRIBUTION_CENTERS",
  description:
    "List the store's distribution centers (centros de distribuição): id, name, CEP and whether it is the default. Order items carry the id of the center that fulfilled them.",
  inputSchema: z.object({}),
  handler: async (_input, client) => {
    const data = await client.get("/centrosdistribuicao");
    return asResult(data);
  },
});

export const listPhysicalStoresTool = createWakeAdminTool({
  id: "WAKE_LIST_PHYSICAL_STORES",
  description:
    "List the store's physical stores (lojas físicas): id, name, city, whether it offers pickup, and its distribution center (centroDistribuicaoId). An order's retiradaLojaId is one of these ids. Paginated (max 50 per page).",
  inputSchema: z.object({
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
    const { data, total } = await client.getPage("/lojasFisicas", input);
    return { ...asResult(data), total };
  },
});

export const locationTools = [
  listDistributionCentersTool,
  listPhysicalStoresTool,
];
