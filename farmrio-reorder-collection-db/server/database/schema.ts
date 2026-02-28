import type {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export interface ReportCriteria {
  nome: string;
  descricao?: string;
  peso?: number;
}

export interface ReportMetric {
  nome: string;
  valor: number;
  unidade?: string;
  fonte?: string;
}

export interface RankedListItem {
  posicao: number;
  itemId: string | number;
  score: number;
  detalhes?: Record<string, number | string>;
}

export interface ReportsTable {
  id: Generated<string>;
  title: string;
  collection_id: string;
  summary: string;
  date: ColumnType<Date, Date | string, Date | string>;
  criterios: ColumnType<ReportCriteria[], ReportCriteria[], ReportCriteria[]>;
  metricas: ColumnType<ReportMetric[], ReportMetric[], ReportMetric[]>;
  ranked_list: ColumnType<RankedListItem[], RankedListItem[], RankedListItem[]>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date | string>;
}

export interface CollectionsTable {
  id: Generated<string>;
  collection_id: number;
  nome: string;
  is_enable: boolean;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date | string>;
}

export interface Database {
  reports: ReportsTable;
  collections: CollectionsTable;
}

export type ReportRow = Selectable<ReportsTable>;
export type ReportInsert = Insertable<ReportsTable>;
export type ReportUpdate = Updateable<ReportsTable>;

export type CollectionRow = Selectable<CollectionsTable>;
export type CollectionInsert = Insertable<CollectionsTable>;
export type CollectionUpdate = Updateable<CollectionsTable>;
