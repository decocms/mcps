/**
 * MCP Registry Client
 *
 * Cliente HTTP para buscar dados da API oficial do Model Context Protocol Registry
 */

export interface RegistryServer {
  server: {
    $schema: string;
    name: string;
    description: string;
    repository?: {
      url?: string;
      source?: string;
      subfolder?: string;
    };
    version: string;
    packages?: Array<any>;
    remotes?: Array<any>;
  };
  _meta: {
    "io.modelcontextprotocol.registry/official"?: {
      status: string;
      publishedAt: string;
      updatedAt: string;
      isLatest: boolean;
    };
  };
}

export interface RegistryResponse {
  servers: RegistryServer[];
  metadata: {
    nextCursor?: string;
    count: number;
  };
}

const DEFAULT_REGISTRY_URL =
  "https://registry.modelcontextprotocol.io/v0.1/servers";
const REQUEST_TIMEOUT = 30000; // 30 seconds

/**
 * Fetch lista de servidores do registry com suporte a paginação via cursor
 */
export async function listServers(
  registryUrl?: string,
  cursor?: string,
): Promise<RegistryResponse> {
  const url = new URL(registryUrl || DEFAULT_REGISTRY_URL);

  if (cursor) {
    url.searchParams.append("cursor", cursor);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Registry API returned status ${response.status}: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as RegistryResponse;
    return data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Timeout de requisição ao registry (30s)");
      }
      throw new Error(`Erro ao buscar dados do registry: ${error.message}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch todos os servidores paginando através do cursor
 */
export async function listAllServers(
  registryUrl?: string,
): Promise<RegistryServer[]> {
  const servers: RegistryServer[] = [];
  let cursor: string | undefined;

  try {
    while (true) {
      const response = await listServers(registryUrl, cursor);
      servers.push(...response.servers);

      if (!response.metadata?.nextCursor) {
        break;
      }

      cursor = response.metadata.nextCursor;
    }
  } catch (error) {
    console.error("Erro ao listar todos os servidores:", error);
    throw error;
  }

  return servers;
}

/**
 * Busca um servidor específico por nome e versão opcional
 *
 * @param name - Nome do servidor (ex: "ai.exa/exa")
 * @param version - Versão específica (ex: "3.1.1"). Se não fornecido, retorna a mais recente
 * @param registryUrl - URL customizada do registry (opcional)
 */
export async function getServer(
  name: string,
  version?: string,
  registryUrl?: string,
): Promise<RegistryServer | null> {
  try {
    const servers = await listAllServers(registryUrl);

    // Filtrar por nome
    const matchingServers = servers.filter((s) => s.server.name === name);

    if (matchingServers.length === 0) {
      return null;
    }

    // Se versão foi especificada, buscar exatamente
    if (version) {
      return matchingServers.find((s) => s.server.version === version) || null;
    }

    // Caso contrário, retornar a mais recente (isLatest: true)
    const latest = matchingServers.find(
      (s) => s._meta["io.modelcontextprotocol.registry/official"]?.isLatest,
    );

    return latest || matchingServers[0];
  } catch (error) {
    console.error(`Erro ao buscar servidor ${name}:`, error);
    throw error;
  }
}

/**
 * Parse um ID no formato "name" ou "name:version"
 */
export function parseServerId(id: string): { name: string; version?: string } {
  const parts = id.split(":");
  return {
    name: parts[0],
    version: parts[1],
  };
}
