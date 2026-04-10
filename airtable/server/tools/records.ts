import { createTool, ensureAuthenticated } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getAccessToken } from "../lib/env.ts";
import { AirtableClient } from "../lib/airtable-client.ts";
import { MAX_BATCH_RECORDS } from "../constants.ts";

const SortSchema = z.object({
  field: z.string().describe("Field name to sort by."),
  direction: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Sort direction. Defaults to asc."),
});

export const createListRecordsTool = (env: Env) =>
  createTool({
    id: "airtable_list_records",
    description:
      "List records from an Airtable table with optional filtering, sorting, and field selection.",
    inputSchema: z.object({
      baseId: z.string().describe("The ID of the base."),
      tableIdOrName: z.string().describe("The ID or name of the table."),
      fields: z
        .array(z.string())
        .optional()
        .describe("Array of field names to include in the response."),
      filterByFormula: z
        .string()
        .optional()
        .describe("Airtable formula to filter records."),
      maxRecords: z
        .number()
        .optional()
        .describe("Maximum number of records to return."),
      pageSize: z
        .number()
        .optional()
        .describe("Number of records per page (max 100)."),
      sort: z
        .array(SortSchema)
        .optional()
        .describe("Array of sort objects to order records."),
      view: z
        .string()
        .optional()
        .describe("The name or ID of the view to use."),
      offset: z
        .string()
        .optional()
        .describe("Pagination offset from a previous response."),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const { baseId, tableIdOrName, ...options } = context;
      const client = new AirtableClient(getAccessToken(env));
      return await client.listRecords(baseId, tableIdOrName, options);
    },
  });

export const createGetRecordTool = (env: Env) =>
  createTool({
    id: "airtable_get_record",
    description: "Retrieve a single record by its ID from an Airtable table.",
    inputSchema: z.object({
      baseId: z.string().describe("The ID of the base."),
      tableIdOrName: z.string().describe("The ID or name of the table."),
      recordId: z.string().describe("The ID of the record to retrieve."),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const client = new AirtableClient(getAccessToken(env));
      return await client.getRecord(
        context.baseId,
        context.tableIdOrName,
        context.recordId,
      );
    },
  });

export const createSearchRecordsTool = (env: Env) =>
  createTool({
    id: "airtable_search_records",
    description:
      "Search for records in an Airtable table by matching a term against specified fields.",
    inputSchema: z.object({
      baseId: z.string().describe("The ID of the base."),
      tableIdOrName: z.string().describe("The ID or name of the table."),
      searchTerm: z.string().describe("The term to search for."),
      searchFields: z
        .array(z.string())
        .min(1)
        .describe("Field names to search in (required)."),
      maxRecords: z
        .number()
        .optional()
        .describe("Maximum number of records to return."),
      pageSize: z.number().optional().describe("Number of records per page."),
      sort: z
        .array(SortSchema)
        .optional()
        .describe("Array of sort objects to order records."),
      view: z
        .string()
        .optional()
        .describe("The name or ID of the view to use."),
      offset: z
        .string()
        .optional()
        .describe("Pagination offset from a previous response."),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const { baseId, tableIdOrName, searchTerm, searchFields, ...options } =
        context;

      const escapedTerm = searchTerm.replace(/"/g, '\\"');
      const fieldFormulas = searchFields.map(
        (field: string) => `SEARCH("${escapedTerm}", {${field}})`,
      );
      const filterByFormula = `OR(${fieldFormulas.join(",")})`;

      const client = new AirtableClient(getAccessToken(env));
      return await client.listRecords(baseId, tableIdOrName, {
        ...options,
        filterByFormula,
      });
    },
  });

export const createCreateRecordsTool = (env: Env) =>
  createTool({
    id: "airtable_create_records",
    description: `Create one or more records in an Airtable table. Maximum ${MAX_BATCH_RECORDS} records per request.`,
    inputSchema: z.object({
      baseId: z.string().describe("The ID of the base."),
      tableIdOrName: z.string().describe("The ID or name of the table."),
      records: z
        .array(
          z.object({
            fields: z
              .record(z.string(), z.unknown())
              .describe("Field name-value pairs for the record."),
          }),
        )
        .min(1)
        .max(MAX_BATCH_RECORDS)
        .describe(`Array of records to create (1-${MAX_BATCH_RECORDS}).`),
      typecast: z
        .boolean()
        .optional()
        .describe(
          "If true, Airtable will auto-convert field values to the correct type.",
        ),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const client = new AirtableClient(getAccessToken(env));
      return await client.createRecords(
        context.baseId,
        context.tableIdOrName,
        context.records,
        context.typecast,
      );
    },
  });

export const createUpdateRecordsTool = (env: Env) =>
  createTool({
    id: "airtable_update_records",
    description: `Update one or more records in an Airtable table. Maximum ${MAX_BATCH_RECORDS} records per request. Supports upsert via performUpsert.`,
    inputSchema: z.object({
      baseId: z.string().describe("The ID of the base."),
      tableIdOrName: z.string().describe("The ID or name of the table."),
      records: z
        .array(
          z.object({
            id: z
              .string()
              .optional()
              .describe(
                "The ID of the record to update. Optional when using performUpsert.",
              ),
            fields: z
              .record(z.string(), z.unknown())
              .describe("Field name-value pairs to update."),
          }),
        )
        .min(1)
        .max(MAX_BATCH_RECORDS)
        .describe(`Array of records to update (1-${MAX_BATCH_RECORDS}).`),
      typecast: z
        .boolean()
        .optional()
        .describe("If true, Airtable will auto-convert field values."),
      performUpsert: z
        .object({
          fieldsToMergeOn: z
            .array(z.string())
            .describe("Fields to match on for upsert."),
        })
        .optional()
        .describe("If provided, performs an upsert instead of a plain update."),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const client = new AirtableClient(getAccessToken(env));
      return await client.updateRecords(
        context.baseId,
        context.tableIdOrName,
        context.records,
        context.typecast,
        context.performUpsert,
      );
    },
  });

export const createDeleteRecordsTool = (env: Env) =>
  createTool({
    id: "airtable_delete_records",
    description: `Delete one or more records from an Airtable table. Maximum ${MAX_BATCH_RECORDS} records per request.`,
    inputSchema: z.object({
      baseId: z.string().describe("The ID of the base."),
      tableIdOrName: z.string().describe("The ID or name of the table."),
      recordIds: z
        .array(z.string())
        .min(1)
        .max(MAX_BATCH_RECORDS)
        .describe(`Array of record IDs to delete (1-${MAX_BATCH_RECORDS}).`),
    }),
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const client = new AirtableClient(getAccessToken(env));
      return await client.deleteRecords(
        context.baseId,
        context.tableIdOrName,
        context.recordIds,
      );
    },
  });
