import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import type { Env } from "../../../types/env.ts";

export const createStrapiGetMediaTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_MEDIA",
    description:
      "Lista arquivos de mídia do Strapi CMS com filtros e paginação.",
    inputSchema: z.object({
      filters: z
        .string()
        .optional()
        .describe("Filtros para a consulta (formato JSON string)"),
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
    execute: async ({ context: { filters, sort, pagination } }) => {
      try {
        const params: Record<string, any> = {};

        if (filters) params.filters = filters;
        if (sort) params.sort = sort;
        if (pagination) params.pagination = pagination;

        const response = await makeRequest(
          env,
          "api/upload/files",
          "GET",
          params,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar arquivos de mídia: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data: responseData?.data || responseData,
          meta: responseData?.meta,
        };
      } catch (error: any) {
        return {
          success: false,
          error:
            error?.message || "Erro desconhecido ao buscar arquivos de mídia",
        };
      }
    },
  });

export const createStrapiGetMediaByIdTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_MEDIA_BY_ID",
    description: "Obtém um arquivo de mídia específico por ID no Strapi CMS.",
    inputSchema: z.object({
      id: z.union([z.string(), z.number()]).describe("ID do arquivo de mídia"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { id } }) => {
      try {
        const response = await makeRequest(
          env,
          `api/upload/files/${id}`,
          "GET",
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar arquivo de mídia: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data: responseData?.data || responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error:
            error?.message || "Erro desconhecido ao buscar arquivo de mídia",
        };
      }
    },
  });

// Note: Upload and Update Media tools are not implemented yet.
// Strapi upload requires multipart/form-data, which is complex to implement in MCP.
// These tools will be added in a future PR when FormData support is available.

export const createStrapiDeleteMediaTool = (env: Env) =>
  createTool({
    id: "STRAPI_DELETE_MEDIA",
    description: "Exclui um arquivo de mídia no Strapi CMS.",
    inputSchema: z.object({
      id: z
        .union([z.string(), z.number()])
        .describe("ID do arquivo de mídia a ser excluído"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { id } }) => {
      try {
        const response = await makeRequest(
          env,
          `api/upload/files/${id}`,
          "DELETE",
          undefined,
          undefined,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao excluir arquivo de mídia: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data: responseData?.data || responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error:
            error?.message || "Erro desconhecido ao excluir arquivo de mídia",
        };
      }
    },
  });

export const createStrapiGetMediaFoldersTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_MEDIA_FOLDERS",
    description: "Lista pastas de mídia do Strapi CMS.",
    inputSchema: z.object({
      filters: z
        .string()
        .optional()
        .describe("Filtros para a consulta (formato JSON string)"),
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
    execute: async ({ context: { filters, sort, pagination } }) => {
      try {
        const params: Record<string, any> = {};

        if (filters) params.filters = filters;
        if (sort) params.sort = sort;
        if (pagination) params.pagination = pagination;

        const response = await makeRequest(
          env,
          "api/upload/folders",
          "GET",
          params,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar pastas de mídia: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data: responseData?.data || responseData,
          meta: responseData?.meta,
        };
      } catch (error: any) {
        return {
          success: false,
          error:
            error?.message || "Erro desconhecido ao buscar pastas de mídia",
        };
      }
    },
  });

export const strapiMediaTools = [
  createStrapiGetMediaTool,
  createStrapiGetMediaByIdTool,
  createStrapiDeleteMediaTool,
  createStrapiGetMediaFoldersTool,
];
