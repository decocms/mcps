/**
 * Strapi i18n / Localization Tools
 *
 * Tools for managing locales and localized content in Strapi CMS.
 * Requires the i18n plugin to be enabled in Strapi.
 *
 * @see https://docs.strapi.io/dev-docs/plugins/i18n
 */
import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import type { Env } from "../../../types/env.ts";
import type { StrapiLocale, ToolResponse } from "../../../types/strapi.ts";

/**
 * List all available locales.
 *
 * GET /api/i18n/locales
 */
export const createStrapiGetLocalesTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_LOCALES",
    description:
      "Lista todos os idiomas (locales) disponíveis no Strapi CMS. Requer o plugin i18n habilitado.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.array(z.any()).optional(),
      error: z.string().optional(),
    }),
    execute: async (): Promise<ToolResponse<StrapiLocale[]>> => {
      try {
        const response = await makeRequest(env, "api/i18n/locales", "GET");

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar locales: ${response.status}. Verifique se o plugin i18n está habilitado.`,
          };
        }

        const locales = response.data as StrapiLocale[];
        return {
          success: true,
          data: Array.isArray(locales) ? locales : [],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao buscar locales: ${message}`,
        };
      }
    },
  });

/**
 * Create a new locale.
 *
 * POST /api/i18n/locales
 */
export const createStrapiCreateLocaleTool = (env: Env) =>
  createTool({
    id: "STRAPI_CREATE_LOCALE",
    description:
      "Cria um novo idioma (locale) no Strapi CMS. Requer o plugin i18n habilitado.",
    inputSchema: z.object({
      name: z
        .string()
        .describe("Nome do idioma (ex: 'Português (Brasil)', 'English')"),
      code: z
        .string()
        .describe("Código ISO do idioma (ex: 'pt-BR', 'en', 'es', 'fr')"),
      isDefault: z
        .boolean()
        .optional()
        .describe("Define como idioma padrão (default: false)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { name, code, isDefault },
    }): Promise<ToolResponse<StrapiLocale>> => {
      try {
        const localeData: Record<string, unknown> = {
          name,
          code,
        };

        if (isDefault !== undefined) {
          localeData.isDefault = isDefault;
        }

        const response = await makeRequest(
          env,
          "api/i18n/locales",
          "POST",
          undefined,
          localeData,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao criar locale: ${response.status}`,
          };
        }

        const locale = response.data as StrapiLocale;
        return {
          success: true,
          data: locale,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao criar locale: ${message}`,
        };
      }
    },
  });

/**
 * Delete a locale.
 *
 * DELETE /api/i18n/locales/:id
 */
export const createStrapiDeleteLocaleTool = (env: Env) =>
  createTool({
    id: "STRAPI_DELETE_LOCALE",
    description:
      "Remove um idioma (locale) do Strapi CMS. Não é possível remover o locale padrão.",
    inputSchema: z.object({
      id: z
        .union([z.string(), z.number()])
        .describe("ID do locale a ser removido"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { id },
    }): Promise<ToolResponse<StrapiLocale>> => {
      try {
        const response = await makeRequest(
          env,
          `api/i18n/locales/${id}`,
          "DELETE",
          undefined,
          undefined,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao deletar locale: ${response.status}. Não é possível remover o locale padrão.`,
          };
        }

        const locale = response.data as StrapiLocale;
        return {
          success: true,
          data: locale,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          error: `Erro ao deletar locale: ${message}`,
        };
      }
    },
  });

/**
 * Get content filtered by locale.
 *
 * Uses the `locale` query parameter on content type endpoints.
 */
export const createStrapiGetContentByLocaleTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_CONTENT_BY_LOCALE",
    description:
      "Lista conteúdo filtrado por idioma (locale) no Strapi CMS. Requer i18n habilitado no content type.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe(
          "Nome do content type no plural (ex: articles, products, pages)",
        ),
      locale: z.string().describe("Código do locale (ex: 'pt-BR', 'en', 'es')"),
      filters: z
        .string()
        .optional()
        .describe(
          'Filtros adicionais (formato JSON string, ex: {"title":{"$contains":"hello"}})',
        ),
      populate: z
        .string()
        .optional()
        .describe(
          'Campos para popular (ex: "cover,category" ou JSON string para populate profundo)',
        ),
      sort: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Ordenação dos resultados"),
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
    execute: async ({
      context: { contentType, locale, filters, populate, sort, pagination },
    }) => {
      try {
        const params: Record<string, unknown> = {
          locale,
        };

        if (filters) {
          try {
            params.filters = JSON.parse(filters);
          } catch {
            params.filters = filters;
          }
        }
        if (populate) {
          try {
            params.populate = JSON.parse(populate);
          } catch {
            params.populate = populate;
          }
        }
        if (sort) params.sort = sort;
        if (pagination) params.pagination = pagination;

        const response = await makeRequest(
          env,
          `api/${contentType}`,
          "GET",
          params,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar conteúdo por locale: ${response.status}`,
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
          error: `Erro ao buscar conteúdo por locale: ${message}`,
        };
      }
    },
  });

export const strapiI18nTools = [
  createStrapiGetLocalesTool,
  createStrapiCreateLocaleTool,
  createStrapiDeleteLocaleTool,
  createStrapiGetContentByLocaleTool,
];
