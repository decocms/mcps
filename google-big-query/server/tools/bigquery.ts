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
// Get Dataset Tool
// ============================================================================

export const createGetDatasetTool = (env: Env) =>
  createPrivateTool({
    id: "bigquery_get_dataset",
    description:
      "Get detailed information about a specific BigQuery dataset. Returns dataset metadata including location, creation time, and description.",
    inputSchema: z.object({
      projectId: z.string().describe("Google Cloud project ID"),
      datasetId: z.string().describe("Dataset ID"),
    }),
    outputSchema: z.object({
      dataset: DatasetSchema.describe("Dataset information"),
      creationTime: z.string().optional().describe("Dataset creation time"),
      lastModifiedTime: z
        .string()
        .optional()
        .describe("Last modification time"),
    }),
    execute: async ({ context }) => {
      const client = new BigQueryClient({
        accessToken: getAccessToken(env),
      });

      const dataset = await client.getDataset(
        context.projectId,
        context.datasetId,
      );

      return {
        dataset: {
          id: dataset.id,
          datasetId: dataset.datasetReference.datasetId,
          projectId: dataset.datasetReference.projectId,
          friendlyName: dataset.friendlyName,
          description: dataset.description,
          location: dataset.location,
        },
        creationTime: dataset.creationTime,
        lastModifiedTime: dataset.lastModifiedTime,
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

function parseTableRef(ref: string): {
  projectId: string;
  datasetId: string;
  tableId: string;
} {
  const trimmed = ref.trim();

  // Format: project:dataset.table
  if (trimmed.includes(":")) {
    const [projectId, rest] = trimmed.split(":", 2);
    const [datasetId, ...tableParts] = rest.split(".");
    const tableId = tableParts.join(".");

    if (!projectId || !datasetId || !tableId) {
      throw new Error(
        `Invalid tableRef "${ref}". Expected "project:dataset.table".`,
      );
    }

    return { projectId, datasetId, tableId };
  }

  // Format: project.dataset.table
  const parts = trimmed.split(".");
  if (parts.length >= 3) {
    const projectId = parts[0];
    const datasetId = parts[1];
    const tableId = parts.slice(2).join(".");

    if (!projectId || !datasetId || !tableId) {
      throw new Error(
        `Invalid tableRef "${ref}". Expected "project.dataset.table".`,
      );
    }

    return { projectId, datasetId, tableId };
  }

  throw new Error(
    `Invalid tableRef "${ref}". Expected "project:dataset.table" or "project.dataset.table".`,
  );
}

export const createGetTableSchemaTool = (env: Env) =>
  createPrivateTool({
    id: "bigquery_get_table_schema",
    description:
      "Get the schema of a specific BigQuery table. Returns all fields with their types, modes, and descriptions.",
    inputSchema: z
      .object({
        /**
         * Fully qualified reference, useful for copy/paste from `bigquery_list_tables`
         * Examples:
         * - "my-project:my_dataset.my_table"
         * - "my-project.my_dataset.my_table"
         */
        tableRef: z
          .string()
          .optional()
          .describe(
            'Fully qualified table reference ("project:dataset.table" or "project.dataset.table").',
          ),
        projectId: z
          .string()
          .optional()
          .describe("Google Cloud project ID (required if tableRef not set)"),
        datasetId: z
          .string()
          .optional()
          .describe(
            'Dataset ID (required if tableRef not set). Also accepts "project:dataset".',
          ),
        tableId: z
          .string()
          .optional()
          .describe(
            'Table ID (required if tableRef not set). Also accepts "dataset.table" or "project:dataset.table".',
          ),
      })
      .superRefine((value, ctx) => {
        if (value.tableRef) {
          return;
        }

        if (!value.projectId) {
          ctx.addIssue({
            code: "custom",
            path: ["projectId"],
            message: "projectId is required when tableRef is not provided.",
          });
        }
        if (!value.datasetId) {
          ctx.addIssue({
            code: "custom",
            path: ["datasetId"],
            message: "datasetId is required when tableRef is not provided.",
          });
        }
        if (!value.tableId) {
          ctx.addIssue({
            code: "custom",
            path: ["tableId"],
            message: "tableId is required when tableRef is not provided.",
          });
        }
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

      let projectId: string;
      let datasetId: string;
      let tableId: string;

      if (context.tableRef) {
        ({ projectId, datasetId, tableId } = parseTableRef(context.tableRef));
      } else {
        // Handle datasetId like "project:dataset"
        if (!context.projectId || !context.datasetId || !context.tableId) {
          throw new Error(
            "Missing required parameters. Provide tableRef or (projectId, datasetId, tableId).",
          );
        }

        projectId = context.projectId;
        datasetId = context.datasetId;
        tableId = context.tableId;

        if (datasetId.includes(":")) {
          const parsed = parseTableRef(`${datasetId}.${tableId}`);
          projectId = parsed.projectId;
          datasetId = parsed.datasetId;
          tableId = parsed.tableId;
        } else if (
          tableId.includes(":") ||
          (tableId.includes(".") && !context.tableRef)
        ) {
          // tableId may be "project:dataset.table" OR "dataset.table"
          if (tableId.includes(":")) {
            const parsed = parseTableRef(tableId);
            projectId = parsed.projectId;
            datasetId = parsed.datasetId;
            tableId = parsed.tableId;
          } else {
            const [maybeDatasetId, ...tableParts] = tableId.split(".");
            const maybeTableId = tableParts.join(".");
            if (maybeDatasetId && maybeTableId) {
              datasetId = maybeDatasetId;
              tableId = maybeTableId;
            }
          }
        }
      }

      const table = await client.getTable(projectId, datasetId, tableId);

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
  createGetDatasetTool,
  createListDatasetsTool,
  createListTablesTool,
  createGetTableSchemaTool,
];
