/**
 * Mapeadores de dados do Registry
 *
 * Converte a resposta da API oficial do MCP Registry para o formato
 * esperado pelo binding COLLECTION
 */

import type { RegistryServer } from "./registry-client.ts";

export interface MappedRegistryServer {
  id: string; // "ai.exa/exa:3.1.1"
  name: string; // "ai.exa/exa"
  version: string; // "3.1.1"
  description: string;
  schema: string; // "$schema" URL
  repository?: {
    url?: string;
    source?: string;
    subfolder?: string;
  };
  packages?: Array<any>;
  remotes?: Array<any>;
  isLatest: boolean;
  publishedAt: string;
  updatedAt: string;
  status?: string;
}

/**
 * Mapeia um servidor da API oficial para o formato do binding
 */
export function mapServer(server: RegistryServer): MappedRegistryServer {
  const meta = server._meta["io.modelcontextprotocol.registry/official"];

  return {
    id: `${server.server.name}:${server.server.version}`,
    name: server.server.name,
    version: server.server.version,
    description: server.server.description,
    schema: server.server.$schema,
    repository: server.server.repository,
    packages: server.server.packages,
    remotes: server.server.remotes,
    isLatest: meta?.isLatest ?? false,
    publishedAt: meta?.publishedAt ?? new Date().toISOString(),
    updatedAt: meta?.updatedAt ?? new Date().toISOString(),
    status: meta?.status,
  };
}

/**
 * Aplica filtros WHERE a uma lista de servidores mapeados
 */
export function applyWhereFilter(
  servers: MappedRegistryServer[],
  where?: Record<string, unknown>,
): MappedRegistryServer[] {
  if (!where) {
    return servers;
  }

  return servers.filter((server) => {
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined || value === null) {
        continue;
      }

      // Simple property matching
      const serverValue = (server as any)[key];

      if (typeof value === "object" && value !== null) {
        // Handle nested conditions - for now, simple string matching
        if ("$eq" in value) {
          if (serverValue !== (value as any).$eq) return false;
        } else if ("$contains" in value) {
          if (typeof serverValue === "string") {
            if (!serverValue.includes((value as any).$contains)) return false;
          }
        } else if ("$in" in value) {
          if (!Array.isArray((value as any).$in)) return false;
          if (!(value as any).$in.includes(serverValue)) return false;
        }
      } else if (serverValue !== value) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Aplica ordenação a uma lista de servidores mapeados
 */
export function applySortOrder(
  servers: MappedRegistryServer[],
  orderBy?: Array<{ field: string[]; direction: "asc" | "desc" }>,
): MappedRegistryServer[] {
  if (!orderBy || orderBy.length === 0) {
    return servers;
  }

  const sorted = [...servers];

  for (let i = orderBy.length - 1; i >= 0; i--) {
    const order = orderBy[i];
    const field = order.field[0]; // Support simple fields for now
    const direction = order.direction === "desc" ? -1 : 1;

    sorted.sort((a, b) => {
      const aVal = (a as any)[field];
      const bVal = (b as any)[field];

      if (aVal === bVal) return 0;
      if (aVal < bVal) return -1 * direction;
      return 1 * direction;
    });
  }

  return sorted;
}

/**
 * Aplica paginação a uma lista de servidores mapeados
 */
export function applyPagination(
  servers: MappedRegistryServer[],
  limit?: number,
  offset?: number,
): MappedRegistryServer[] {
  const start = offset ?? 0;
  const end = limit ? start + limit : servers.length;
  return servers.slice(start, end);
}
