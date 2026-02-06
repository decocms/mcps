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

export const createStrapiUploadMediaTool = (env: Env) =>
  createTool({
    id: "STRAPI_UPLOAD_MEDIA",
    description:
      "Faz upload de um arquivo de mídia para o Strapi CMS a partir de uma URL.",
    inputSchema: z.object({
      fileUrl: z
        .string()
        .url()
        .describe("URL do arquivo a ser baixado e enviado"),
      fileName: z
        .string()
        .optional()
        .describe(
          "Nome do arquivo (opcional, será extraído da URL se omitido)",
        ),
      alternativeText: z
        .string()
        .optional()
        .describe("Texto alternativo para o arquivo"),
      caption: z.string().optional().describe("Legenda do arquivo"),
      folder: z
        .union([z.string(), z.number()])
        .optional()
        .describe("ID da pasta onde salvar o arquivo"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { fileUrl, fileName, alternativeText, caption, folder },
    }) => {
      try {
        // Download the file from URL
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
          return {
            success: false,
            error: `Erro ao baixar arquivo: ${fileResponse.status} ${fileResponse.statusText}`,
          };
        }

        // Get file blob and content type
        const fileBlob = await fileResponse.blob();
        const contentType =
          fileResponse.headers.get("content-type") ||
          "application/octet-stream";

        // Extract filename from URL if not provided
        const finalFileName =
          fileName ||
          fileUrl.split("/").pop()?.split("?")[0] ||
          `file-${Date.now()}`;

        // Create FormData
        const formData = new FormData();
        formData.append("files", fileBlob, finalFileName);

        // Add fileInfo if metadata is provided
        const fileInfo: Record<string, string> = {};
        if (alternativeText) fileInfo.alternativeText = alternativeText;
        if (caption) fileInfo.caption = caption;

        if (Object.keys(fileInfo).length > 0) {
          formData.append("fileInfo", JSON.stringify(fileInfo));
        }

        if (folder) {
          formData.append("path", String(folder));
        }

        // Get Strapi credentials
        const apiEndpoint = (
          await import("../../../lib/env.ts")
        ).getStrapiApiEndpoint(env);
        const apiToken = (
          await import("../../../lib/env.ts")
        ).getStrapiApiToken(env);

        // Make upload request
        const uploadResponse = await fetch(`${apiEndpoint}/api/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          return {
            success: false,
            error: `Erro ao fazer upload: ${uploadResponse.status} - ${errorText}`,
          };
        }

        const responseData = await uploadResponse.json();
        return {
          success: true,
          data: Array.isArray(responseData) ? responseData[0] : responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error:
            error?.message || "Erro desconhecido ao fazer upload do arquivo",
        };
      }
    },
  });

export const createStrapiUpdateMediaTool = (env: Env) =>
  createTool({
    id: "STRAPI_UPDATE_MEDIA",
    description:
      "Atualiza informações (metadata) de um arquivo de mídia no Strapi CMS.",
    inputSchema: z.object({
      id: z.union([z.string(), z.number()]).describe("ID do arquivo de mídia"),
      name: z.string().optional().describe("Novo nome do arquivo"),
      alternativeText: z.string().optional().describe("Novo texto alternativo"),
      caption: z.string().optional().describe("Nova legenda"),
      folder: z
        .union([z.string(), z.number()])
        .optional()
        .describe("ID da nova pasta"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { id, name, alternativeText, caption, folder },
    }) => {
      try {
        // Build fileInfo object with only provided fields
        const fileInfo: Record<string, string | number> = {};
        if (name !== undefined) fileInfo.name = name;
        if (alternativeText !== undefined)
          fileInfo.alternativeText = alternativeText;
        if (caption !== undefined) fileInfo.caption = caption;
        if (folder !== undefined) fileInfo.folder = folder;

        if (Object.keys(fileInfo).length === 0) {
          return {
            success: false,
            error: "Nenhum campo para atualizar foi fornecido",
          };
        }

        // Use standard makeRequest with JSON body
        // Strapi accepts JSON for updating file metadata
        const response = await makeRequest(
          env,
          `api/upload/files/${id}`,
          "PUT",
          undefined,
          fileInfo,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao atualizar arquivo de mídia: ${response.status}`,
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
            error?.message || "Erro desconhecido ao atualizar arquivo de mídia",
        };
      }
    },
  });

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
  createStrapiUploadMediaTool,
  createStrapiUpdateMediaTool,
  createStrapiDeleteMediaTool,
  createStrapiGetMediaFoldersTool,
];
