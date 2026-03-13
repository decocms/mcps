import { AIRTABLE_API_BASE } from "../constants.ts";
import type {
  AirtableRecord,
  BaseSchemaResponse,
  CreateFieldBody,
  CreateTableBody,
  Field,
  FieldSet,
  ListBasesResponse,
  ListRecordsOptions,
  ListRecordsResponse,
  Table,
  UpdateFieldBody,
  UpdateTableBody,
  WhoamiResponse,
} from "./types.ts";

export class AirtableClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${AIRTABLE_API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Airtable API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  async whoami(): Promise<WhoamiResponse> {
    return this.request("/meta/whoami");
  }

  async listBases(offset?: string): Promise<ListBasesResponse> {
    const params = new URLSearchParams();
    if (offset) params.set("offset", offset);
    const qs = params.toString();
    return this.request(`/meta/bases${qs ? `?${qs}` : ""}`);
  }

  async getBaseSchema(
    baseId: string,
    offset?: string,
  ): Promise<BaseSchemaResponse> {
    const params = new URLSearchParams();
    if (offset) params.set("offset", offset);
    const qs = params.toString();
    return this.request(`/meta/bases/${baseId}/tables${qs ? `?${qs}` : ""}`);
  }

  async listRecords(
    baseId: string,
    tableIdOrName: string,
    options?: ListRecordsOptions,
  ): Promise<ListRecordsResponse> {
    const params = new URLSearchParams();
    if (options) {
      if (options.filterByFormula)
        params.set("filterByFormula", options.filterByFormula);
      if (options.maxRecords)
        params.set("maxRecords", String(options.maxRecords));
      if (options.pageSize) params.set("pageSize", String(options.pageSize));
      if (options.view) params.set("view", options.view);
      if (options.offset) params.set("offset", options.offset);
      if (options.cellFormat) params.set("cellFormat", options.cellFormat);
      if (options.timeZone) params.set("timeZone", options.timeZone);
      if (options.userLocale) params.set("userLocale", options.userLocale);
      if (options.returnFieldsByFieldId)
        params.set("returnFieldsByFieldId", "true");
      if (options.fields) {
        for (const field of options.fields) {
          params.append("fields[]", field);
        }
      }
      if (options.sort) {
        options.sort.forEach((s, i) => {
          params.set(`sort[${i}][field]`, s.field);
          if (s.direction) {
            params.set(`sort[${i}][direction]`, s.direction);
          }
        });
      }
    }
    const qs = params.toString();
    const table = encodeURIComponent(tableIdOrName);
    return this.request(`/${baseId}/${table}${qs ? `?${qs}` : ""}`);
  }

  async getRecord(
    baseId: string,
    tableIdOrName: string,
    recordId: string,
  ): Promise<AirtableRecord> {
    const table = encodeURIComponent(tableIdOrName);
    return this.request(`/${baseId}/${table}/${recordId}`);
  }

  async createRecords(
    baseId: string,
    tableIdOrName: string,
    records: Array<{ fields: FieldSet }>,
    typecast?: boolean,
  ): Promise<{ records: AirtableRecord[] }> {
    const table = encodeURIComponent(tableIdOrName);
    return this.request(`/${baseId}/${table}`, {
      method: "POST",
      body: JSON.stringify({ records, typecast }),
    });
  }

  async updateRecords(
    baseId: string,
    tableIdOrName: string,
    records: Array<{ id?: string; fields: FieldSet }>,
    typecast?: boolean,
    performUpsert?: { fieldsToMergeOn: string[] },
  ): Promise<{ records: AirtableRecord[] }> {
    const table = encodeURIComponent(tableIdOrName);
    return this.request(`/${baseId}/${table}`, {
      method: "PATCH",
      body: JSON.stringify({ records, typecast, performUpsert }),
    });
  }

  async deleteRecords(
    baseId: string,
    tableIdOrName: string,
    recordIds: string[],
  ): Promise<{ records: Array<{ id: string; deleted: boolean }> }> {
    const params = new URLSearchParams();
    for (const id of recordIds) {
      params.append("records[]", id);
    }
    const table = encodeURIComponent(tableIdOrName);
    return this.request(`/${baseId}/${table}?${params.toString()}`, {
      method: "DELETE",
    });
  }

  async createTable(baseId: string, body: CreateTableBody): Promise<Table> {
    return this.request(`/meta/bases/${baseId}/tables`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateTable(
    baseId: string,
    tableId: string,
    body: UpdateTableBody,
  ): Promise<Table> {
    return this.request(`/meta/bases/${baseId}/tables/${tableId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async createField(
    baseId: string,
    tableId: string,
    body: CreateFieldBody,
  ): Promise<Field> {
    return this.request(`/meta/bases/${baseId}/tables/${tableId}/fields`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateField(
    baseId: string,
    tableId: string,
    fieldId: string,
    body: UpdateFieldBody,
  ): Promise<Field> {
    return this.request(
      `/meta/bases/${baseId}/tables/${tableId}/fields/${fieldId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
  }
}
