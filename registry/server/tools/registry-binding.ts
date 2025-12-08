/**
 * Registry Binding Implementation
 *
 * Implementa os tools COLLECTION_REGISTRY_LIST e COLLECTION_REGISTRY_GET
 * para acessar o Model Context Protocol Registry
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { StateSchema } from "../main.ts";
import {
  listAllServers,
  getServer,
  parseServerId,
} from "../lib/registry-client.ts";
import {
  mapServer,
  applyWhereFilter,
  applySortOrder,
  applyPagination,
} from "../lib/mappers.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Schema para um servidor do registry
 */
const RegistryServerSchema = z.object({
  id: z.string().describe("Identificador único (name:version)"),
  name: z.string().describe("Nome do servidor (ex: ai.exa/exa)"),
  version: z.string().describe("Versão do servidor"),
  description: z.string().describe("Descrição do servidor"),
  schema: z.string().describe("URL do schema JSON Schema"),
  repository: z
    .object({
      url: z.string().optional(),
      source: z.string().optional(),
      subfolder: z.string().optional(),
    })
    .optional()
    .describe("Informações do repositório"),
  packages: z.array(z.unknown()).optional().describe("Pacotes disponíveis"),
  remotes: z.array(z.unknown()).optional().describe("Remotes disponíveis"),
  isLatest: z.boolean().describe("Se é a versão mais recente"),
  publishedAt: z.string().describe("Data de publicação"),
  updatedAt: z.string().describe("Data de atualização"),
  status: z.string().optional().describe("Status do servidor"),
});

/**
 * Input schema para LIST
 */
const ListInputSchema = z
  .object({
    where: z.record(z.unknown()).optional(),
    orderBy: z
      .array(
        z.object({
          field: z.array(z.string()),
          direction: z.enum(["asc", "desc"]).optional().default("asc"),
        }),
      )
      .optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    cursor: z.string().optional(),
  })
  .describe("Contexto de filtragem, ordenação e paginação");

/**
 * Output schema para LIST
 */
const ListOutputSchema = z.object({
  servers: z.array(RegistryServerSchema),
  nextCursor: z.string().optional(),
  total: z.number(),
});

/**
 * Input schema para GET
 */
const GetInputSchema = z.object({
  id: z
    .string()
    .describe("ID do servidor (format: 'ai.exa/exa' ou 'ai.exa/exa:3.1.1')"),
});

/**
 * Output schema para GET
 */
const GetOutputSchema = RegistryServerSchema;

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * COLLECTION_REGISTRY_LIST - Lista todos os servidores do registry
 */
export const createListRegistryTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_REGISTRY_LIST",
    description:
      "Lista todos os servidores MCP disponíveis no registry com suporte a filtragem, ordenação e paginação",
    inputSchema: ListInputSchema,
    outputSchema: ListOutputSchema,
    execute: async ({ context }: { context: any }) => {
      const { where, orderBy, limit, offset } = context as z.infer<
        typeof ListInputSchema
      >;
      try {
        // Obter URL do registry da configuração
        const registryUrl =
          (env.state as z.infer<typeof StateSchema> | undefined)?.registryUrl ||
          undefined;

        // Buscar todos os servidores do registry
        const servers = await listAllServers(registryUrl);

        // Mapear para o formato esperado
        let mappedServers = servers.map(mapServer);

        // Aplicar filtros
        if (where) {
          mappedServers = applyWhereFilter(
            mappedServers,
            where as Record<string, unknown>,
          );
        }

        // Aplicar ordenação
        if (orderBy) {
          mappedServers = applySortOrder(mappedServers, orderBy);
        }

        // Aplicar paginação
        const finalLimit = limit || 50;
        const finalOffset = offset || 0;
        const paginatedServers = applyPagination(
          mappedServers,
          finalLimit,
          finalOffset,
        );

        return {
          servers: paginatedServers,
          total: mappedServers.length,
          nextCursor: undefined, // Por simplicidade, usar offset/limit em vez de cursor
        };
      } catch (error) {
        console.error("Erro ao listar servidores do registry:", error);
        throw new Error(
          `Erro ao listar servidores: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
        );
      }
    },
  });

/**
 * COLLECTION_REGISTRY_GET - Obtém um servidor específico do registry
 */
export const createGetRegistryTool = (env: Env) =>
  createPrivateTool({
    id: "COLLECTION_REGISTRY_GET",
    description:
      "Obtém um servidor MCP específico do registry por ID (format: 'name' ou 'name:version')",
    inputSchema: GetInputSchema,
    outputSchema: GetOutputSchema,
    execute: async ({ context }: { context: any }) => {
      const id = context?.id;
      try {
        if (!id) {
          throw new Error(`ID do servidor não fornecido`);
        }
        // Parse do ID
        const { name, version } = parseServerId(id);

        // Obter URL do registry da configuração
        const registryUrl =
          (env.state as z.infer<typeof StateSchema> | undefined)?.registryUrl ||
          undefined;

        // Buscar servidor específico
        const server = await getServer(name, version, registryUrl);

        if (!server) {
          throw new Error(`Servidor não encontrado: ${id}`);
        }

        // Mapear para o formato esperado
        return mapServer(server);
      } catch (error) {
        console.error("Erro ao obter servidor do registry:", error);
        throw new Error(
          `Erro ao obter servidor: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
        );
      }
    },
  });
