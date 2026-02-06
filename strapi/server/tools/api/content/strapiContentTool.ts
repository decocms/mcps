import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import type { Env } from "../../../types/env.ts";

export const createStrapiGetContentTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_CONTENT",
    description:
      "Lista entradas de conteúdo de um tipo específico no Strapi CMS.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe("Nome do content type (ex: articles, products)"),
      filters: z
        .string()
        .optional()
        .describe(
          'Filtros para a consulta (formato JSON string, ex: {"title":{"$contains":"hello"}})',
        ),
      populate: z
        .string()
        .optional()
        .describe(
          'Campos para popular (formato: "field1,field2" ou JSON string para populate profundo)',
        ),
      sort: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Ordenação dos resultados"),
      pagination: z
        .object({
          page: z.number().optional(),
          pageSize: z.number().optional(),
          start: z.number().optional(),
          limit: z.number().optional(),
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
      context: { contentType, filters, populate, sort, pagination },
    }) => {
      try {
        const params: Record<string, any> = {};

        if (filters) {
          try {
            params.filters = JSON.parse(filters);
          } catch {
            params.filters = filters;
          }
        }
        if (populate) params.populate = populate;
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
            error: `Erro ao buscar conteúdo: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data:
            responseData?.data ||
            (Array.isArray(responseData) ? responseData : []),
          meta: responseData?.meta,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao buscar conteúdo",
        };
      }
    },
  });

export const createStrapiGetContentByIdTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_CONTENT_BY_ID",
    description:
      "Obtém uma entrada específica de conteúdo por ID no Strapi CMS.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe("Nome do content type (ex: articles, products)"),
      id: z.union([z.string(), z.number()]).describe("ID da entrada"),
      populate: z
        .string()
        .optional()
        .describe(
          'Campos para popular (formato: "field1,field2" ou JSON string para populate profundo)',
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { contentType, id, populate } }) => {
      try {
        const params: Record<string, any> = {};
        if (populate) params.populate = populate;

        const response = await makeRequest(
          env,
          `api/${contentType}/${id}`,
          "GET",
          params,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar entrada: ${response.status}`,
          };
        }

        const responseData = response.data as
          | {
              data?: unknown;
            }
          | unknown;
        return {
          success: true,
          data:
            (typeof responseData === "object" &&
              responseData !== null &&
              "data" in responseData &&
              responseData.data) ||
            responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao buscar entrada",
        };
      }
    },
  });

export const createStrapiCreateContentTool = (env: Env) =>
  createTool({
    id: "STRAPI_CREATE_CONTENT",
    description: "Cria uma nova entrada de conteúdo no Strapi CMS.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe("Nome do content type (ex: articles, products)"),
      data: z.string().describe("Dados da nova entrada (formato JSON string)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { contentType, data } }) => {
      try {
        let parsedData: any;
        try {
          parsedData = JSON.parse(data);
        } catch {
          return {
            success: false,
            error: "Dados inválidos: formato JSON esperado",
          };
        }

        const response = await makeRequest(
          env,
          `api/${contentType}`,
          "POST",
          undefined,
          { data: parsedData },
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao criar entrada: ${response.status}`,
          };
        }

        const responseData = response.data as
          | {
              data?: unknown;
            }
          | unknown;
        return {
          success: true,
          data:
            (typeof responseData === "object" &&
              responseData !== null &&
              "data" in responseData &&
              responseData.data) ||
            responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao criar entrada",
        };
      }
    },
  });

export const createStrapiUpdateContentTool = (env: Env) =>
  createTool({
    id: "STRAPI_UPDATE_CONTENT",
    description: "Atualiza uma entrada existente de conteúdo no Strapi CMS.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe("Nome do content type (ex: articles, products)"),
      id: z
        .union([z.string(), z.number()])
        .describe("ID da entrada a ser atualizada"),
      data: z
        .string()
        .describe("Dados atualizados da entrada (formato JSON string)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { contentType, id, data } }) => {
      try {
        let parsedData: any;
        try {
          parsedData = JSON.parse(data);
        } catch {
          return {
            success: false,
            error: "Dados inválidos: formato JSON esperado",
          };
        }

        const response = await makeRequest(
          env,
          `api/${contentType}/${id}`,
          "PUT",
          undefined,
          { data: parsedData },
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao atualizar entrada: ${response.status}`,
          };
        }

        const responseData = response.data as
          | {
              data?: unknown;
            }
          | unknown;
        return {
          success: true,
          data:
            (typeof responseData === "object" &&
              responseData !== null &&
              "data" in responseData &&
              responseData.data) ||
            responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao atualizar entrada",
        };
      }
    },
  });

export const createStrapiDeleteContentTool = (env: Env) =>
  createTool({
    id: "STRAPI_DELETE_CONTENT",
    description: "Exclui uma entrada de conteúdo no Strapi CMS.",
    inputSchema: z.object({
      contentType: z
        .string()
        .describe("Nome do content type (ex: articles, products)"),
      id: z
        .union([z.string(), z.number()])
        .describe("ID da entrada a ser excluída"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { contentType, id } }) => {
      try {
        const response = await makeRequest(
          env,
          `api/${contentType}/${id}`,
          "DELETE",
          undefined,
          undefined,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao excluir entrada: ${response.status}`,
          };
        }

        const responseData = response.data as
          | {
              data?: unknown;
            }
          | unknown;
        return {
          success: true,
          data:
            (typeof responseData === "object" &&
              responseData !== null &&
              "data" in responseData &&
              responseData.data) ||
            responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao excluir entrada",
        };
      }
    },
  });

export const strapiContentTools = [
  createStrapiGetContentTool,
  createStrapiGetContentByIdTool,
  createStrapiCreateContentTool,
  createStrapiUpdateContentTool,
  createStrapiDeleteContentTool,
];
