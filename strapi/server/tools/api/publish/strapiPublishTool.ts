/**
 * Strapi Publish / Unpublish Tools
 *
 * Tools for managing content publication state in Strapi CMS.
 * Supports both Strapi v4 (publishedAt field) and v5 (document actions).
 *
 * @see https://docs.strapi.io/dev-docs/api/rest#publication-state
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import { sanitizePathSegment } from "../../../lib/sanitize.ts";
import type { Env } from "../../../types/env.ts";
import type {
  StrapiPublishResponse,
  ToolResponse,
} from "../../../types/strapi.ts";

/**
 * Publish a content entry (make it publicly available).
 *
 * Strapi v5: POST /api/:contentType/:documentId/actions/publish
 * Strapi v4 fallback: PUT /api/:contentType/:id with { publishedAt: now }
 */
export const createStrapiPublishContentTool = (env: Env) =>
  createTool({
    id: "STRAPI_PUBLISH_CONTENT",
    description:
      "Publica uma entrada de conteúdo no Strapi CMS, tornando-a publicamente acessível.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe(
          "Nome do content type no plural (ex: articles, products, pages)",
        ),
      documentId: z
        .string()
        .describe(
          "ID do documento a ser publicado (documentId ou id numérico)",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { contentType, documentId },
    }): Promise<ToolResponse<StrapiPublishResponse["data"]>> => {
      try {
        const safeContentType = sanitizePathSegment(contentType, "contentType");
        const safeDocumentId = sanitizePathSegment(documentId, "documentId");

        // Try v5 action endpoint first
        const response = await makeRequest(
          env,
          `api/${safeContentType}/${safeDocumentId}/actions/publish`,
          "POST",
          undefined,
          {},
          true,
        );

        if (response.success) {
          const responseData = response.data as StrapiPublishResponse;
          return {
            success: true,
            data: responseData?.data ?? responseData,
          };
        }

        // Fallback to v4: set publishedAt
        if (response.status === 404) {
          const fallbackResponse = await makeRequest(
            env,
            `api/${safeContentType}/${safeDocumentId}`,
            "PUT",
            undefined,
            { data: { publishedAt: new Date().toISOString() } },
            true,
          );

          if (!fallbackResponse.success) {
            return {
              success: false,
              error: `Erro ao publicar conteúdo: ${fallbackResponse.status}`,
            };
          }

          const fallbackData = fallbackResponse.data as StrapiPublishResponse;
          return {
            success: true,
            data: fallbackData?.data ?? fallbackData,
          };
        }

        return {
          success: false,
          error: `Erro ao publicar conteúdo: ${response.status}`,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao publicar conteúdo: ${message}`,
        };
      }
    },
  });

/**
 * Unpublish a content entry (revert to draft state).
 *
 * Strapi v5: POST /api/:contentType/:documentId/actions/unpublish
 * Strapi v4 fallback: PUT /api/:contentType/:id with { publishedAt: null }
 */
export const createStrapiUnpublishContentTool = (env: Env) =>
  createTool({
    id: "STRAPI_UNPUBLISH_CONTENT",
    description:
      "Despublica uma entrada de conteúdo no Strapi CMS, revertendo para rascunho.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe(
          "Nome do content type no plural (ex: articles, products, pages)",
        ),
      documentId: z
        .string()
        .describe(
          "ID do documento a ser despublicado (documentId ou id numérico)",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { contentType, documentId },
    }): Promise<ToolResponse<StrapiPublishResponse["data"]>> => {
      try {
        const safeContentType = sanitizePathSegment(contentType, "contentType");
        const safeDocumentId = sanitizePathSegment(documentId, "documentId");

        // Try v5 action endpoint first
        const response = await makeRequest(
          env,
          `api/${safeContentType}/${safeDocumentId}/actions/unpublish`,
          "POST",
          undefined,
          {},
          true,
        );

        if (response.success) {
          const responseData = response.data as StrapiPublishResponse;
          return {
            success: true,
            data: responseData?.data ?? responseData,
          };
        }

        // Fallback to v4: set publishedAt to null
        if (response.status === 404) {
          const fallbackResponse = await makeRequest(
            env,
            `api/${safeContentType}/${safeDocumentId}`,
            "PUT",
            undefined,
            { data: { publishedAt: null } },
            true,
          );

          if (!fallbackResponse.success) {
            return {
              success: false,
              error: `Erro ao despublicar conteúdo: ${fallbackResponse.status}`,
            };
          }

          const fallbackData = fallbackResponse.data as StrapiPublishResponse;
          return {
            success: true,
            data: fallbackData?.data ?? fallbackData,
          };
        }

        return {
          success: false,
          error: `Erro ao despublicar conteúdo: ${response.status}`,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao despublicar conteúdo: ${message}`,
        };
      }
    },
  });

/**
 * Get content filtered by publication state (draft or published).
 */
export const createStrapiGetContentByStatusTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_CONTENT_BY_STATUS",
    description:
      "Lista conteúdo filtrado por estado de publicação (rascunho ou publicado) no Strapi CMS.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe(
          "Nome do content type no plural (ex: articles, products, pages)",
        ),
      status: z
        .enum(["draft", "published"])
        .describe(
          "Estado de publicação: 'draft' (rascunho) ou 'published' (publicado)",
        ),
      sort: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Ordenação dos resultados (ex: 'createdAt:desc')"),
      pagination: z
        .object({
          page: z.number().optional(),
          pageSize: z.number().optional(),
        })
        .optional()
        .describe("Configurações de paginação"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.array(z.any()).optional(),
      meta: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { contentType, status, sort, pagination } }) => {
      try {
        const safeContentType = sanitizePathSegment(contentType, "contentType");
        const params: Record<string, unknown> = {
          publicationState: status === "draft" ? "preview" : "live",
        };

        // For draft, also filter by publishedAt null
        if (status === "draft") {
          params.filters = { publishedAt: { $null: true } };
        }

        if (sort) params.sort = sort;
        if (pagination) params.pagination = pagination;

        const response = await makeRequest(
          env,
          `api/${safeContentType}`,
          "GET",
          params,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar conteúdo por status: ${response.status}`,
          };
        }

        const responseData = response.data as {
          data?: unknown[];
          meta?: unknown;
        };
        return {
          success: true,
          data:
            responseData?.data ??
            (Array.isArray(responseData) ? responseData : []),
          meta: responseData?.meta,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao buscar conteúdo por status: ${message}`,
        };
      }
    },
  });

export const strapiPublishTools = [
  createStrapiPublishContentTool,
  createStrapiUnpublishContentTool,
  createStrapiGetContentByStatusTool,
];
