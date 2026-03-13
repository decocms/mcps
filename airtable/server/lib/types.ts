export interface FieldSet {
  [key: string]: unknown;
}

export interface AirtableRecord {
  id: string;
  createdTime?: string;
  fields: FieldSet;
}

export interface Field {
  id?: string;
  name: string;
  type: string;
  description?: string;
  options?: unknown;
}

export interface Table {
  id: string;
  name: string;
  fields: Field[];
  primaryFieldId?: string;
  description?: string;
  views?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

export interface ListBasesResponse {
  bases: Array<{
    id: string;
    name: string;
    permissionLevel: string;
  }>;
  offset?: string;
}

export interface BaseSchemaResponse {
  tables: Table[];
  offset?: string;
}

export interface ListRecordsOptions {
  fields?: string[];
  filterByFormula?: string;
  maxRecords?: number;
  pageSize?: number;
  sort?: Array<{
    field: string;
    direction?: "asc" | "desc";
  }>;
  view?: string;
  cellFormat?: "json" | "string";
  timeZone?: string;
  userLocale?: string;
  offset?: string;
  returnFieldsByFieldId?: boolean;
}

export interface ListRecordsResponse {
  records: AirtableRecord[];
  offset?: string;
}

export interface CreateRecordBody {
  fields: FieldSet;
  typecast?: boolean;
}

export interface CreateRecordsBody {
  records: Array<{ fields: FieldSet; typecast?: boolean }>;
  typecast?: boolean;
}

export interface UpdateRecordsBody {
  records: Array<{ id: string; fields: FieldSet }>;
  typecast?: boolean;
  performUpsert?: {
    fieldsToMergeOn: string[];
  };
}

export interface CreateTableBody {
  name: string;
  description?: string;
  fields: Field[];
  primaryFieldId?: string;
}

export interface UpdateTableBody {
  name?: string;
  description?: string;
  primaryFieldId?: string;
}

export type CreateFieldBody = Omit<Field, "id">;

export interface UpdateFieldBody {
  name?: string;
  description?: string;
}

export interface WhoamiResponse {
  id: string;
  email?: string;
  scopes?: string[];
}
