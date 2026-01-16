/**
 * Content Scrape Tool
 *
 * Tool to fetch scraped content from database tables.
 */

import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { createDatabaseClient, type DatabaseClient } from "../lib/db-client.ts";

/**
 * Available tables for content scraping
 */
const TableEnum = z.enum(["all", "contents", "reddit", "linkedin", "twitter"]);

type TableType = z.infer<typeof TableEnum>;

/**
 * Map table enum values to actual database table names
 */
const TABLE_NAMES: Record<Exclude<TableType, "all">, string> = {
  contents: "contents",
  reddit: "reddit_content_scrape",
  linkedin: "linkedin_content_scrape",
  twitter: "twitter_content_scrape",
};

/**
 * Query a single table with pagination
 */
async function queryTable(
  client: DatabaseClient,
  tableName: string,
  startIndex: number,
  endIndex: number,
): Promise<{ table: string; data: Record<string, unknown>[] }> {
  const limit = endIndex - startIndex + 1;
  const offset = startIndex - 1;

  const query = `
    SELECT * FROM ${tableName}
    ORDER BY id
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const result = await client.query(query);

  return {
    table: tableName,
    data: result.rows,
  };
}

/**
 * Get content scrape tool - fetches scraped content from database tables
 */
export const getContentScrapeTool = (env: Env) =>
  createPrivateTool({
    id: "get_content_scrape",
    description:
      "Busca conteúdo coletado do banco de dados. " +
      "Pode buscar de uma tabela específica (contents, reddit, linkedin, twitter) ou de todas. " +
      "Suporta paginação por range de índices.",
    inputSchema: z.object({
      table: TableEnum.default("all").describe(
        'Qual tabela buscar: "all" para todas, ou "contents", "reddit", "linkedin", "twitter" para uma específica',
      ),
      startIndex: z
        .number()
        .int()
        .positive()
        .default(1)
        .describe(
          "Índice inicial - a partir de qual item começar (default: 1)",
        ),
      endIndex: z
        .number()
        .int()
        .positive()
        .default(100)
        .describe("Índice final - até qual item buscar (default: 100)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      results: z
        .array(
          z.object({
            table: z.string().describe("Nome da tabela"),
            data: z
              .array(z.record(z.string(), z.unknown()))
              .describe("Dados retornados da tabela"),
            count: z.number().describe("Quantidade de registros retornados"),
          }),
        )
        .optional(),
      totalCount: z
        .number()
        .optional()
        .describe("Total de registros retornados"),
      range: z
        .object({
          startIndex: z.number(),
          endIndex: z.number(),
        })
        .optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { table, startIndex, endIndex } = context;

      try {
        const state = env.MESH_REQUEST_CONTEXT?.state;
        const apiUrl = state?.database?.apiUrl ?? "";
        const token = state?.database?.token ?? "";

        if (!apiUrl) {
          return {
            success: false,
            error: "Database API URL not configured",
          };
        }

        if (!token) {
          return {
            success: false,
            error: "Database token not configured",
          };
        }

        // Validate range
        if (startIndex > endIndex) {
          return {
            success: false,
            error: "startIndex must be less than or equal to endIndex",
          };
        }

        // Create database client
        let client: DatabaseClient;
        try {
          client = createDatabaseClient(apiUrl, token);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: `Failed to connect to database: ${message}`,
          };
        }

        try {
          // Test connection
          const isConnected = await client.testConnection();
          if (!isConnected) {
            return {
              success: false,
              error: "Failed to establish database connection",
            };
          }

          const results: Array<{
            table: string;
            data: Record<string, unknown>[];
            count: number;
          }> = [];

          if (table === "all") {
            // Query all tables
            const tables = Object.entries(TABLE_NAMES);
            for (const [key, tableName] of tables) {
              try {
                const result = await queryTable(
                  client,
                  tableName,
                  startIndex,
                  endIndex,
                );
                results.push({
                  table: key,
                  data: result.data,
                  count: result.data.length,
                });
              } catch (error) {
                // Log error but continue with other tables
                console.error(`Error querying ${tableName}:`, error);
                results.push({
                  table: key,
                  data: [],
                  count: 0,
                });
              }
            }
          } else {
            // Query single table
            const tableName = TABLE_NAMES[table];
            const result = await queryTable(
              client,
              tableName,
              startIndex,
              endIndex,
            );
            results.push({
              table,
              data: result.data,
              count: result.data.length,
            });
          }

          const totalCount = results.reduce((sum, r) => sum + r.count, 0);

          return {
            success: true,
            results,
            totalCount,
            range: {
              startIndex,
              endIndex,
            },
          };
        } finally {
          await client.close();
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

/**
 * Export all content scrape tools
 */
export const contentScrapeTools = [getContentScrapeTool];
