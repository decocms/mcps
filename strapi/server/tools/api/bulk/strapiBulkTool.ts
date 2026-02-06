/**
 * Strapi Bulk Operations Tools
 *
 * Tools for performing bulk actions on content in Strapi CMS.
 * Available from Strapi v4.15+.
 *
 * @see https://docs.strapi.io/dev-docs/api/rest#bulk-operations
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import { sanitizePathSegment } from "../../../lib/sanitize.ts";
import type { Env } from "../../../types/env.ts";
import type {
  StrapiBulkActionResponse,
  ToolResponse,
} from "../../../types/strapi.ts";

/**
 * Bulk delete multiple content entries.
 *
 * POST /api/:contentType/actions/bulkDelete
 */
export const createStrapiBulkDeleteTool = (env: Env) =>
  createTool({
    id: "STRAPI_BULK_DELETE",
    description:
      "Exclui múltiplas entradas de conteúdo de uma vez no Strapi CMS. Disponível a partir do Strapi v4.15+.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe(
          "Nome do content type no plural (ex: articles, products, pages)",
        ),
      ids: z
        .string()
        .describe(
          "IDs das entradas a deletar (formato JSON array, ex: '[1, 2, 3]' ou '[\"abc123\", \"def456\"]')",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      count: z.number().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { contentType, ids },
    }): Promise<
      ToolResponse<StrapiBulkActionResponse> & { count?: number }
    > => {
      try {
        const safeContentType = sanitizePathSegment(contentType, "contentType");
        let parsedIds: (string | number)[];
        try {
          parsedIds = JSON.parse(ids) as (string | number)[];
        } catch {
          return {
            success: false,
            error: "IDs inválidos: formato JSON array esperado (ex: [1, 2, 3])",
          };
        }

        if (!Array.isArray(parsedIds) || parsedIds.length === 0) {
          return {
            success: false,
            error: "É necessário fornecer ao menos um ID para deletar",
          };
        }

        // Determine if using documentIds (strings) or numeric ids
        const isDocumentIds = parsedIds.every(
          (id) => typeof id === "string" && Number.isNaN(Number(id)),
        );

        const body: Record<string, unknown> = isDocumentIds
          ? { documentIds: parsedIds }
          : { ids: parsedIds.map(Number) };

        const response = await makeRequest(
          env,
          `api/${safeContentType}/actions/bulkDelete`,
          "POST",
          undefined,
          body,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao deletar em massa: ${response.status}`,
          };
        }

        const responseData = response.data as StrapiBulkActionResponse;
        return {
          success: true,
          count: responseData?.count ?? parsedIds.length,
          data: responseData,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao deletar em massa: ${message}`,
        };
      }
    },
  });

/**
 * Bulk publish multiple content entries.
 *
 * POST /api/:contentType/actions/bulkPublish
 */
export const createStrapiBulkPublishTool = (env: Env) =>
  createTool({
    id: "STRAPI_BULK_PUBLISH",
    description:
      "Publica múltiplas entradas de conteúdo de uma vez no Strapi CMS. Requer Draft & Publish habilitado.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe(
          "Nome do content type no plural (ex: articles, products, pages)",
        ),
      ids: z
        .string()
        .describe(
          "IDs das entradas a publicar (formato JSON array, ex: '[1, 2, 3]' ou '[\"abc123\", \"def456\"]')",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      count: z.number().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { contentType, ids },
    }): Promise<
      ToolResponse<StrapiBulkActionResponse> & { count?: number }
    > => {
      try {
        const safeContentType = sanitizePathSegment(contentType, "contentType");
        let parsedIds: (string | number)[];
        try {
          parsedIds = JSON.parse(ids) as (string | number)[];
        } catch {
          return {
            success: false,
            error: "IDs inválidos: formato JSON array esperado (ex: [1, 2, 3])",
          };
        }

        if (!Array.isArray(parsedIds) || parsedIds.length === 0) {
          return {
            success: false,
            error: "É necessário fornecer ao menos um ID para publicar",
          };
        }

        const isDocumentIds = parsedIds.every(
          (id) => typeof id === "string" && Number.isNaN(Number(id)),
        );

        const body: Record<string, unknown> = isDocumentIds
          ? { documentIds: parsedIds }
          : { ids: parsedIds.map(Number) };

        const response = await makeRequest(
          env,
          `api/${safeContentType}/actions/bulkPublish`,
          "POST",
          undefined,
          body,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao publicar em massa: ${response.status}. Verifique se Draft & Publish está habilitado.`,
          };
        }

        const responseData = response.data as StrapiBulkActionResponse;
        return {
          success: true,
          count: responseData?.count ?? parsedIds.length,
          data: responseData,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao publicar em massa: ${message}`,
        };
      }
    },
  });

/**
 * Bulk unpublish multiple content entries.
 *
 * POST /api/:contentType/actions/bulkUnpublish
 */
export const createStrapiBulkUnpublishTool = (env: Env) =>
  createTool({
    id: "STRAPI_BULK_UNPUBLISH",
    description:
      "Despublica múltiplas entradas de conteúdo de uma vez no Strapi CMS, revertendo para rascunho.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe(
          "Nome do content type no plural (ex: articles, products, pages)",
        ),
      ids: z
        .string()
        .describe(
          "IDs das entradas a despublicar (formato JSON array, ex: '[1, 2, 3]' ou '[\"abc123\", \"def456\"]')",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      count: z.number().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { contentType, ids },
    }): Promise<
      ToolResponse<StrapiBulkActionResponse> & { count?: number }
    > => {
      try {
        const safeContentType = sanitizePathSegment(contentType, "contentType");
        let parsedIds: (string | number)[];
        try {
          parsedIds = JSON.parse(ids) as (string | number)[];
        } catch {
          return {
            success: false,
            error: "IDs inválidos: formato JSON array esperado (ex: [1, 2, 3])",
          };
        }

        if (!Array.isArray(parsedIds) || parsedIds.length === 0) {
          return {
            success: false,
            error: "É necessário fornecer ao menos um ID para despublicar",
          };
        }

        const isDocumentIds = parsedIds.every(
          (id) => typeof id === "string" && Number.isNaN(Number(id)),
        );

        const body: Record<string, unknown> = isDocumentIds
          ? { documentIds: parsedIds }
          : { ids: parsedIds.map(Number) };

        const response = await makeRequest(
          env,
          `api/${safeContentType}/actions/bulkUnpublish`,
          "POST",
          undefined,
          body,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao despublicar em massa: ${response.status}`,
          };
        }

        const responseData = response.data as StrapiBulkActionResponse;
        return {
          success: true,
          count: responseData?.count ?? parsedIds.length,
          data: responseData,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao despublicar em massa: ${message}`,
        };
      }
    },
  });

export const strapiBulkTools = [
  createStrapiBulkDeleteTool,
  createStrapiBulkPublishTool,
  createStrapiBulkUnpublishTool,
];
