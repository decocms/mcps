/**
 * Cliente HTTP para interação com a API Pública do Datajud.
 *
 * Documentação: https://datajud-wiki.cnj.jus.br/api-publica/
 */

/**
 * Tipos baseados no Modelo de Transferência de Dados (MTD) do Datajud
 */
export interface ProcessoDatajud {
  numeroProcesso?: string;
  classe?: {
    codigo?: string;
    nome?: string;
  };
  sistema?: {
    codigo?: string;
    nome?: string;
  };
  formato?: {
    codigo?: string;
    nome?: string;
  };
  tribunal?: string;
  dataAjuizamento?: string;
  procEl?: boolean;
  dataHoraUltimaAtualizacao?: string;
  grau?: string;
  orgaoJulgador?: {
    codigoOrgao?: string;
    nomeOrgao?: string;
    instancia?: string;
  };
  assuntos?: Array<{
    codigo?: string;
    nome?: string;
    principal?: boolean;
  }>;
  movimentos?: Array<{
    codigo?: string;
    nome?: string;
    dataHora?: string;
  }>;
  nivelSigilo?: number;
  [key: string]: unknown; // Para campos adicionais do MTD
}

export interface DatajudSearchResponse {
  took: number;
  timed_out: boolean;
  _shards: {
    total: number;
    successful: number;
    skipped: number;
    failed: number;
  };
  hits: {
    total: {
      value: number;
      relation: string;
    };
    max_score: number | null;
    hits: Array<{
      _index: string;
      _id: string;
      _score: number | null;
      _source: ProcessoDatajud;
    }>;
  };
  aggregations?: Record<string, unknown>;
}

export interface DatajudClientConfig {
  apiKey: string;
  tribunal: string;
}

/**
 * Cliente para interação com a API Pública do Datajud
 */
export class DatajudClient {
  private apiKey: string;
  private tribunal: string;
  private baseUrl: string;

  constructor(config: DatajudClientConfig) {
    this.apiKey = config.apiKey;
    this.tribunal = config.tribunal.toLowerCase();
    this.baseUrl = `https://api-publica.datajud.cnj.jus.br/api_publica_${this.tribunal}/_search`;
  }

  /**
   * Executa uma busca na API do Datajud usando query Elasticsearch
   */
  async search(query: Record<string, unknown>): Promise<DatajudSearchResponse> {
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `APIKey ${this.apiKey}`,
        },
        body: JSON.stringify(query),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Erro na API do Datajud (${response.status}): ${errorText}`,
        );
      }

      const data = await response.json();
      return data as DatajudSearchResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Falha ao buscar processos: ${error.message}`);
      }
      throw new Error("Falha ao buscar processos: Erro desconhecido");
    }
  }

  /**
   * Busca um processo específico pelo número
   */
  async getProcessByNumber(
    numeroProcesso: string,
  ): Promise<ProcessoDatajud | null> {
    const query = {
      query: {
        term: {
          "numeroProcesso.keyword": numeroProcesso,
        },
      },
      size: 1,
    };

    const response = await this.search(query);

    if (response.hits.hits.length === 0) {
      return null;
    }

    return response.hits.hits[0]._source;
  }

  /**
   * Busca processos com filtros
   */
  async searchProcesses(params: {
    filters?: Record<string, unknown>;
    size?: number;
    from?: number;
    sort?: Array<Record<string, unknown>>;
  }): Promise<DatajudSearchResponse> {
    const { filters = {}, size = 10, from = 0, sort } = params;

    const query: Record<string, unknown> = {
      query: {
        bool: {
          must: [],
          filter: [],
        },
      },
      size,
      from,
    };

    // Adiciona filtros à query
    if (Object.keys(filters).length > 0) {
      (query.query as any).bool.filter = Object.entries(filters).map(
        ([key, value]) => {
          if (typeof value === "object" && value !== null) {
            return { [key]: value };
          }
          // Para strings, usa match para busca mais flexível
          if (typeof value === "string") {
            return { match: { [key]: value } };
          }
          // Para outros tipos, usa term para match exato
          return { term: { [key]: value } };
        },
      );
    }

    // Adiciona ordenação se especificada
    if (sort && sort.length > 0) {
      query.sort = sort;
    }

    return await this.search(query);
  }

  /**
   * Executa agregações para estatísticas
   */
  async aggregateStatistics(params: {
    aggregations: Record<string, unknown>;
    filters?: Record<string, unknown>;
  }): Promise<DatajudSearchResponse> {
    const { aggregations, filters = {} } = params;

    const query: Record<string, unknown> = {
      size: 0, // Não retorna documentos, apenas agregações
      aggs: aggregations,
    };

    // Adiciona filtros se especificados
    if (Object.keys(filters).length > 0) {
      query.query = {
        bool: {
          filter: Object.entries(filters).map(([key, value]) => {
            if (typeof value === "object" && value !== null) {
              return { [key]: value };
            }
            if (typeof value === "string") {
              return { match: { [key]: value } };
            }
            return { term: { [key]: value } };
          }),
        },
      };
    }

    return await this.search(query);
  }
}

/**
 * Factory function para criar uma instância do DatajudClient
 */
export function createDatajudClient(
  config: DatajudClientConfig,
): DatajudClient {
  return new DatajudClient(config);
}
