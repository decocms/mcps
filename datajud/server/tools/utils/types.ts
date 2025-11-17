/**
 * Tipos TypeScript baseados no Modelo de Transferência de Dados (MTD) do Datajud
 *
 * Documentação: https://datajud-wiki.cnj.jus.br/mtd/
 */

/**
 * Classe processual
 */
export interface Classe {
  codigo: string;
  nome: string;
}

/**
 * Sistema de origem do processo
 */
export interface Sistema {
  codigo: string;
  nome: string;
}

/**
 * Formato do processo
 */
export interface Formato {
  codigo: string;
  nome: string;
}

/**
 * Órgão julgador
 */
export interface OrgaoJulgador {
  codigoOrgao: string;
  nomeOrgao: string;
  instancia: string;
  codigoMunicipioIBGE?: string;
}

/**
 * Assunto processual
 */
export interface Assunto {
  codigo: string;
  nome: string;
  principal?: boolean;
}

/**
 * Movimento processual
 */
export interface Movimento {
  codigo: string;
  nome: string;
  dataHora: string;
  complementos?: Array<{
    codigo?: string;
    nome?: string;
    valor?: string;
  }>;
}

/**
 * Parte no processo
 */
export interface Parte {
  tipo: string;
  nome?: string;
  cpfCnpj?: string;
  polo?: string;
}

/**
 * Processo judicial completo
 */
export interface ProcessoJudicial {
  // Identificação
  numeroProcesso: string;
  tribunal: string;
  grau: string; // G1, G2, G3

  // Classificação
  classe?: Classe;
  sistema?: Sistema;
  formato?: Formato;

  // Órgão
  orgaoJulgador?: OrgaoJulgador;

  // Datas
  dataAjuizamento?: string;
  dataHoraUltimaAtualizacao?: string;

  // Características
  procEl?: boolean; // Processo eletrônico
  nivelSigilo?: number; // 0-5

  // Assuntos e movimentos
  assuntos?: Assunto[];
  movimentos?: Movimento[];

  // Partes (podem estar omitidas por sigilo)
  partes?: Parte[];

  // Outros campos do MTD
  valorCausa?: number;
  descricaoValorCausa?: string;
  outrosNumerosProcesso?: string[];

  // Campos adicionais (o MTD pode ter mais campos)
  [key: string]: unknown;
}

/**
 * Graus de jurisdição
 */
export enum Grau {
  PrimeiroGrau = "G1",
  SegundoGrau = "G2",
  TerceiroGrau = "G3",
}

/**
 * Níveis de sigilo
 */
export enum NivelSigilo {
  SemSigilo = 0,
  Sigilo1 = 1,
  Sigilo2 = 2,
  Sigilo3 = 3,
  Sigilo4 = 4,
  Sigilo5 = 5,
}

/**
 * Resultado de busca da API do Datajud
 */
export interface DatajudSearchResult {
  total: number;
  returned: number;
  processes: ProcessoJudicial[];
  tribunal: string;
}

/**
 * Resultado de consulta de processo específico
 */
export interface DatajudProcessResult {
  found: boolean;
  process: ProcessoJudicial | null;
  tribunal: string;
}

/**
 * Resultado de agregações estatísticas
 */
export interface DatajudAggregationResult {
  aggregations: Record<string, unknown>;
  totalDocuments: number;
  tribunal: string;
}

/**
 * Bucket de agregação (genérico)
 */
export interface AggregationBucket {
  key: string | number;
  key_as_string?: string;
  doc_count: number;
  [key: string]: unknown; // Para sub-agregações
}

/**
 * Resultado de agregação de termos
 */
export interface TermsAggregation {
  doc_count_error_upper_bound: number;
  sum_other_doc_count: number;
  buckets: AggregationBucket[];
}

/**
 * Resultado de agregação de histograma de datas
 */
export interface DateHistogramAggregation {
  buckets: Array<{
    key_as_string: string;
    key: number;
    doc_count: number;
  }>;
}

/**
 * Filtros para busca de processos
 */
export interface ProcessSearchFilters {
  "classe.codigo"?: string;
  "classe.nome"?: string;
  grau?: Grau | string;
  "orgaoJulgador.nomeOrgao"?: string;
  "orgaoJulgador.instancia"?: string;
  "assuntos.codigo"?: string;
  dataAjuizamento?: string | DateRangeFilter;
  dataHoraUltimaAtualizacao?: string | DateRangeFilter;
  procEl?: boolean;
  nivelSigilo?: number;
  [key: string]: unknown;
}

/**
 * Filtro de range para datas
 */
export interface DateRangeFilter {
  gte?: string; // Greater than or equal
  lte?: string; // Less than or equal
  gt?: string; // Greater than
  lt?: string; // Less than
}

/**
 * Parâmetros de ordenação
 */
export type SortOrder = "asc" | "desc";

export interface SortParam {
  [field: string]: SortOrder;
}
