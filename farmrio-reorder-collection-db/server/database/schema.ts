import type {
  ColumnType,
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export type ReportStatus = "passing" | "failing" | "warning";
export type SectionType = "metrics" | "criteria" | "note" | "ranked-list";
export type MetricItemStatus = "info" | "warning" | "error" | "success";

export interface CollectionTable {
  id: Generated<number>;
  farm_collection_id: string;
  deco_collection_id: string | null;
  title: string;
  is_enabled: boolean;
}

export interface ReportTable {
  id: Generated<number>;
  collection_id: number;
  title: string;
  category: string;
  status: ReportStatus;
  summary: string | null;
  source: string | null;
  tags: string[] | null;
  updated_at: ColumnType<Date, Date | string, Date | string>;
}

export interface ReportSectionTable {
  id: Generated<number>;
  report_id: number;
  type: SectionType;
  title: string | null;
  content: string | null;
  position: number;
}

export interface SectionCriteriaItemTable {
  id: Generated<number>;
  section_id: number;
  label: string;
  description: string | null;
}

export interface SectionMetricItemTable {
  id: Generated<number>;
  section_id: number;
  label: string;
  value: ColumnType<string, number, number>;
  unit: string | null;
  status: MetricItemStatus;
}

export interface SectionRankedItemTable {
  id: Generated<number>;
  section_id: number;
  position: number;
  delta: number;
  label: string;
  image: string | null;
  value_select_rate: string | null;
  value_availability: string | null;
  sessions: number | null;
  select_rate: ColumnType<string | null, number | null, number | null>;
  add_to_cart_rate: ColumnType<string | null, number | null, number | null>;
  purchase_rate: ColumnType<string | null, number | null, number | null>;
}

export interface Database {
  collection: CollectionTable;
  report: ReportTable;
  report_section: ReportSectionTable;
  section_criteria_item: SectionCriteriaItemTable;
  section_metric_item: SectionMetricItemTable;
  section_ranked_item: SectionRankedItemTable;
}

export type CollectionRow = Selectable<CollectionTable>;
export type CollectionInsert = Insertable<CollectionTable>;
export type CollectionUpdate = Updateable<CollectionTable>;

export type ReportRow = Selectable<ReportTable>;
export type ReportInsert = Insertable<ReportTable>;
export type ReportUpdate = Updateable<ReportTable>;

export type ReportSectionRow = Selectable<ReportSectionTable>;
export type ReportSectionInsert = Insertable<ReportSectionTable>;

export type SectionCriteriaItemRow = Selectable<SectionCriteriaItemTable>;
export type SectionCriteriaItemInsert = Insertable<SectionCriteriaItemTable>;

export type SectionMetricItemRow = Selectable<SectionMetricItemTable>;
export type SectionMetricItemInsert = Insertable<SectionMetricItemTable>;

export type SectionRankedItemRow = Selectable<SectionRankedItemTable>;
export type SectionRankedItemInsert = Insertable<SectionRankedItemTable>;
