/**
 * BigQuery Tools
 *
 * Tools for querying, listing datasets/tables, and exploring schemas
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { BigQueryClient, getAccessToken } from "../lib/bigquery-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const TableFieldSchemaZod: z.ZodType<{
  name: string;
  type: string;
  mode?: string;
  description?: string;
  fields?: unknown[];
}> = z.object({
  name: z.string().describe("Field name"),
  type: z
    .string()
    .describe(
      "Field type (STRING, INTEGER, FLOAT, BOOLEAN, TIMESTAMP, RECORD, etc.)",
    ),
  mode: z
    .string()
    .optional()
    .describe("Field mode (NULLABLE, REQUIRED, REPEATED)"),
  description: z.string().optional().describe("Field description"),
  fields: z
    .array(z.lazy(() => TableFieldSchemaZod))
    .optional()
    .describe("Nested fields for RECORD type"),
});

const DatasetSchema = z.object({
  id: z.string().describe("Full dataset ID (project:dataset)"),
  datasetId: z.string().describe("Dataset ID"),
  projectId: z.string().describe("Project ID"),
  friendlyName: z.string().optional().describe("Dataset friendly name"),
  description: z.string().optional().describe("Dataset description"),
  location: z.string().optional().describe("Dataset location"),
});

const TableInfoSchema = z.object({
  id: z.string().describe("Full table ID (project:dataset.table)"),
  tableId: z.string().describe("Table ID"),
  datasetId: z.string().describe("Dataset ID"),
  projectId: z.string().describe("Project ID"),
  type: z
    .string()
    .optional()
    .describe("Table type (TABLE, VIEW, MATERIALIZED_VIEW, etc.)"),
  friendlyName: z.string().optional().describe("Table friendly name"),
  description: z.string().optional().describe("Table description"),
  numRows: z.string().optional().describe("Number of rows"),
  numBytes: z.string().optional().describe("Size in bytes"),
});

// ============================================================================
// Execute Query Tool
// ============================================================================

export const createQueryTool = (env: Env) =>
  createPrivateTool({
    id: "bigquery_query",
    description:
      "Execute a SQL query against Google BigQuery. Returns the query results with schema information. Supports standard SQL by default.",
    inputSchema: z.object({
      projectId: z.string().describe("Google Cloud project ID"),
      query: z.string().describe("SQL query to execute"),
      useLegacySql: z
        .boolean()
        .optional()
        .describe("Use legacy SQL syntax (default: false, uses standard SQL)"),
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .optional()
        .describe("Maximum number of rows to return (default: 1000)"),
      timeoutMs: z.coerce
        .number()
        .int()
        .optional()
        .describe("Query timeout in milliseconds (default: 60000)"),
      useQueryCache: z
        .boolean()
        .optional()
        .describe("Whether to use query cache (default: true)"),
      defaultDatasetId: z
        .string()
        .optional()
        .describe("Default dataset for unqualified table names"),
    }),
    outputSchema: z.object({
      schema: z
        .object({
          fields: z.array(TableFieldSchemaZod).optional(),
        })
        .describe("Query result schema"),
      rows: z
        .array(z.record(z.string(), z.unknown()))
        .describe("Query result rows as objects"),
      totalRows: z.string().describe("Total number of rows in result"),
      cacheHit: z.boolean().describe("Whether results came from cache"),
      totalBytesProcessed: z
        .string()
        .describe("Total bytes processed by the query"),
    }),
    execute: async ({ context }) => {
      const client = new BigQueryClient({
        accessToken: getAccessToken(env),
      });

      const result = await client.queryAndWait(context.projectId, {
        query: context.query,
        useLegacySql: context.useLegacySql,
        maxResults: context.maxResults,
        timeoutMs: context.timeoutMs,
        useQueryCache: context.useQueryCache,
        defaultDataset: context.defaultDatasetId
          ? {
              projectId: context.projectId,
              datasetId: context.defaultDatasetId,
            }
          : undefined,
      });

      // Convert rows to objects using schema field names
      const fieldNames = result.schema.fields?.map((f) => f.name) || [];
      const rows = result.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        row.f?.forEach((cell, index) => {
          if (fieldNames[index]) {
            obj[fieldNames[index]] = cell.v;
          }
        });
        return obj;
      });

      return {
        schema: result.schema,
        rows,
        totalRows: result.totalRows,
        cacheHit: result.cacheHit,
        totalBytesProcessed: result.totalBytesProcessed,
      };
    },
  });

// ============================================================================
// List Datasets Tool
// ============================================================================

export const createListDatasetsTool = (env: Env) =>
  createPrivateTool({
    id: "bigquery_list_datasets",
    description:
      "List all datasets in a Google BigQuery project. Returns dataset IDs, names, and metadata.",
    inputSchema: z.object({
      projectId: z.string().describe("Google Cloud project ID"),
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Maximum number of datasets to return"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page of results"),
      all: z
        .boolean()
        .optional()
        .describe("Whether to list all datasets, including hidden ones"),
    }),
    outputSchema: z.object({
      datasets: z.array(DatasetSchema).describe("List of datasets"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page"),
    }),
    execute: async ({ context }) => {
      const client = new BigQueryClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listDatasets(context.projectId, {
        maxResults: context.maxResults,
        pageToken: context.pageToken,
        all: context.all,
      });

      const datasets = (response.datasets || []).map((ds) => ({
        id: ds.id,
        datasetId: ds.datasetReference.datasetId,
        projectId: ds.datasetReference.projectId,
        friendlyName: ds.friendlyName,
        description: ds.description,
        location: ds.location,
      }));

      return {
        datasets,
        nextPageToken: response.nextPageToken,
      };
    },
  });

// ============================================================================
// List Tables Tool
// ============================================================================

export const createListTablesTool = (env: Env) =>
  createPrivateTool({
    id: "bigquery_list_tables",
    description:
      "List all tables in a Google BigQuery dataset. Returns table IDs, types, and metadata.",
    inputSchema: z.object({
      projectId: z.string().describe("Google Cloud project ID"),
      datasetId: z.string().describe("Dataset ID"),
      maxResults: z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Maximum number of tables to return"),
      pageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page of results"),
    }),
    outputSchema: z.object({
      tables: z.array(TableInfoSchema).describe("List of tables"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for fetching next page"),
      totalItems: z.number().optional().describe("Total number of tables"),
    }),
    execute: async ({ context }) => {
      const client = new BigQueryClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listTables(
        context.projectId,
        context.datasetId,
        {
          maxResults: context.maxResults,
          pageToken: context.pageToken,
        },
      );

      const tables = (response.tables || []).map((t) => ({
        id: t.id,
        tableId: t.tableReference.tableId,
        datasetId: t.tableReference.datasetId,
        projectId: t.tableReference.projectId,
        type: t.type,
        friendlyName: t.friendlyName,
        description: t.description,
        numRows: t.numRows,
        numBytes: t.numBytes,
      }));

      return {
        tables,
        nextPageToken: response.nextPageToken,
        totalItems: response.totalItems,
      };
    },
  });

// ============================================================================
// Get Table Schema Tool
// ============================================================================

export const createGetTableSchemaTool = (env: Env) =>
  createPrivateTool({
    id: "bigquery_get_table_schema",
    description:
      "Get the schema of a specific BigQuery table. Returns all fields with their types, modes, and descriptions.",
    inputSchema: z.object({
      projectId: z.string().describe("Google Cloud project ID"),
      datasetId: z.string().describe("Dataset ID"),
      tableId: z.string().describe("Table ID"),
    }),
    outputSchema: z.object({
      table: z.object({
        id: z.string().describe("Full table ID"),
        tableId: z.string().describe("Table ID"),
        datasetId: z.string().describe("Dataset ID"),
        projectId: z.string().describe("Project ID"),
        type: z.string().optional(),
        friendlyName: z.string().optional(),
        description: z.string().optional(),
        numRows: z.string().optional(),
        numBytes: z.string().optional(),
      }),
      schema: z
        .object({
          fields: z.array(TableFieldSchemaZod).optional(),
        })
        .describe("Table schema"),
    }),
    execute: async ({ context }) => {
      const client = new BigQueryClient({
        accessToken: getAccessToken(env),
      });

      const table = await client.getTable(
        context.projectId,
        context.datasetId,
        context.tableId,
      );

      return {
        table: {
          id: table.id,
          tableId: table.tableReference.tableId,
          datasetId: table.tableReference.datasetId,
          projectId: table.tableReference.projectId,
          type: table.type,
          friendlyName: table.friendlyName,
          description: table.description,
          numRows: table.numRows,
          numBytes: table.numBytes,
        },
        schema: table.schema || { fields: [] },
      };
    },
  });

// ============================================================================
// Export all BigQuery tools
// ============================================================================

export const bigqueryTools = [
  createQueryTool,
  createListDatasetsTool,
  createListTablesTool,
  createGetTableSchemaTool,
];
