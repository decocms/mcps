/**
 * Strapi Single Type Tools
 *
 * Tools for managing Single Types in Strapi CMS.
 * Single Types are unique content entries (e.g., homepage, global settings)
 * that don't have multiple entries like Collection Types.
 *
 * @see https://docs.strapi.io/dev-docs/api/rest#single-type
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import { sanitizePathSegment } from "../../../lib/sanitize.ts";
import type { Env } from "../../../types/env.ts";
import type {
  StrapiSingleTypeResponse,
  ToolResponse,
} from "../../../types/strapi.ts";

/**
 * Get a single type content entry.
 *
 * GET /api/:singularApiId
 *
 * Unlike Collection Types, Single Types return a single object, not an array.
 */
export const createStrapiGetSingleTypeTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_SINGLE_TYPE",
    description:
      "Obtém o conteúdo de um Single Type no Strapi (ex: homepage, about-page, global-settings).",
    inputSchema: z.object({
      singularApiId: z
        .string()
        .describe(
          "ID singular da API do Single Type (ex: 'homepage', 'about-page', 'global')",
        ),
      populate: z
        .string()
        .optional()
        .describe(
          'Campos para popular (ex: "hero,seo" ou JSON string para populate profundo como \'{"hero":{"populate":"*"}}\')',
        ),
      locale: z
        .string()
        .optional()
        .describe("Código do locale para conteúdo i18n (ex: 'pt-BR', 'en')"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      meta: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { singularApiId, populate, locale },
    }): Promise<ToolResponse<StrapiSingleTypeResponse["data"]>> => {
      try {
        const safeSingularApiId = sanitizePathSegment(
          singularApiId,
          "singularApiId",
        );
        const params: Record<string, unknown> = {};

        if (populate) {
          try {
            params.populate = JSON.parse(populate);
          } catch {
            params.populate = populate;
          }
        }
        if (locale) params.locale = locale;

        const response = await makeRequest(
          env,
          `api/${safeSingularApiId}`,
          "GET",
          params,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar single type '${singularApiId}': ${response.status}`,
          };
        }

        const responseData = response.data as StrapiSingleTypeResponse;
        return {
          success: true,
          data: responseData?.data ?? responseData,
          meta: responseData?.meta,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao buscar single type: ${message}`,
        };
      }
    },
  });

/**
 * Update a single type content entry.
 *
 * PUT /api/:singularApiId
 */
export const createStrapiUpdateSingleTypeTool = (env: Env) =>
  createTool({
    id: "STRAPI_UPDATE_SINGLE_TYPE",
    description:
      "Atualiza o conteúdo de um Single Type no Strapi (ex: homepage, global-settings).",
    inputSchema: z.object({
      singularApiId: z
        .string()
        .describe(
          "ID singular da API do Single Type (ex: 'homepage', 'about-page', 'global')",
        ),
      data: z
        .string()
        .describe(
          'Dados atualizados (formato JSON string, ex: \'{"title":"Novo Título","description":"Nova desc"}\')',
        ),
      locale: z
        .string()
        .optional()
        .describe("Código do locale para conteúdo i18n (ex: 'pt-BR', 'en')"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { singularApiId, data, locale },
    }): Promise<ToolResponse<StrapiSingleTypeResponse["data"]>> => {
      try {
        const safeSingularApiId = sanitizePathSegment(
          singularApiId,
          "singularApiId",
        );
        let parsedData: Record<string, unknown>;
        try {
          parsedData = JSON.parse(data) as Record<string, unknown>;
        } catch {
          return {
            success: false,
            error: "Dados inválidos: formato JSON esperado",
          };
        }

        const params: Record<string, unknown> = {};
        if (locale) params.locale = locale;

        const response = await makeRequest(
          env,
          `api/${safeSingularApiId}`,
          "PUT",
          Object.keys(params).length > 0 ? params : undefined,
          { data: parsedData },
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao atualizar single type '${singularApiId}': ${response.status}`,
          };
        }

        const responseData = response.data as StrapiSingleTypeResponse;
        return {
          success: true,
          data: responseData?.data ?? responseData,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao atualizar single type: ${message}`,
        };
      }
    },
  });

/**
 * Delete a single type content entry.
 *
 * DELETE /api/:singularApiId
 */
export const createStrapiDeleteSingleTypeTool = (env: Env) =>
  createTool({
    id: "STRAPI_DELETE_SINGLE_TYPE",
    description:
      "Remove o conteúdo de um Single Type no Strapi (reseta para vazio).",
    inputSchema: z.object({
      singularApiId: z
        .string()
        .describe(
          "ID singular da API do Single Type (ex: 'homepage', 'about-page', 'global')",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { singularApiId },
    }): Promise<ToolResponse<StrapiSingleTypeResponse["data"]>> => {
      try {
        const safeSingularApiId = sanitizePathSegment(
          singularApiId,
          "singularApiId",
        );
        const response = await makeRequest(
          env,
          `api/${safeSingularApiId}`,
          "DELETE",
          undefined,
          undefined,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao deletar single type '${singularApiId}': ${response.status}`,
          };
        }

        const responseData = response.data as StrapiSingleTypeResponse;
        return {
          success: true,
          data: responseData?.data ?? responseData,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao deletar single type: ${message}`,
        };
      }
    },
  });

export const strapiSingleTypeTools = [
  createStrapiGetSingleTypeTool,
  createStrapiUpdateSingleTypeTool,
  createStrapiDeleteSingleTypeTool,
];
