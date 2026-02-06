import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import type { Env } from "../../../types/env.ts";

export const createStrapiGetRolesTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_ROLES",
    description: "Lista roles (funções) disponíveis no Strapi CMS.",
    inputSchema: z.object({
      filters: z
        .string()
        .optional()
        .describe("Filtros para a consulta de roles (formato JSON string)"),
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
          "api/users-permissions/roles",
          "GET",
          params,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar roles: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data: responseData?.roles || responseData?.data || responseData,
          meta: responseData?.meta,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao buscar roles",
        };
      }
    },
  });

export const createStrapiGetRoleByIdTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_ROLE_BY_ID",
    description: "Obtém um role específico por ID no Strapi CMS.",
    inputSchema: z.object({
      id: z.union([z.string(), z.number()]).describe("ID do role"),
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
          `api/users-permissions/roles/${id}`,
          "GET",
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar role: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data: responseData?.role || responseData?.data || responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao buscar role",
        };
      }
    },
  });

export const createStrapiCreateRoleTool = (env: Env) =>
  createTool({
    id: "STRAPI_CREATE_ROLE",
    description: "Cria um novo role no Strapi CMS.",
    inputSchema: z.object({
      name: z.string().describe("Nome do role"),
      description: z.string().optional().describe("Descrição do role"),
      type: z.string().optional().describe("Tipo do role"),
      permissions: z
        .string()
        .optional()
        .describe("Permissões do role (formato JSON string)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { name, description, type, permissions } }) => {
      try {
        const roleData: any = {
          name,
        };

        if (description !== undefined) roleData.description = description;
        if (type !== undefined) roleData.type = type;
        if (permissions !== undefined) {
          try {
            roleData.permissions = JSON.parse(permissions);
          } catch {
            return {
              success: false,
              error: "Permissões inválidas: formato JSON esperado",
            };
          }
        }

        const response = await makeRequest(
          env,
          "api/users-permissions/roles",
          "POST",
          undefined,
          roleData,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao criar role: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data: responseData?.role || responseData?.data || responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao criar role",
        };
      }
    },
  });

export const createStrapiUpdateRoleTool = (env: Env) =>
  createTool({
    id: "STRAPI_UPDATE_ROLE",
    description: "Atualiza um role existente no Strapi CMS.",
    inputSchema: z.object({
      id: z
        .union([z.string(), z.number()])
        .describe("ID do role a ser atualizado"),
      name: z.string().optional().describe("Novo nome do role"),
      description: z.string().optional().describe("Nova descrição do role"),
      type: z.string().optional().describe("Novo tipo do role"),
      permissions: z
        .string()
        .optional()
        .describe("Novas permissões do role (formato JSON string)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { id, name, description, type, permissions },
    }) => {
      try {
        const roleData: any = {};

        if (name !== undefined) roleData.name = name;
        if (description !== undefined) roleData.description = description;
        if (type !== undefined) roleData.type = type;
        if (permissions !== undefined) {
          try {
            roleData.permissions = JSON.parse(permissions);
          } catch {
            return {
              success: false,
              error: "Permissões inválidas: formato JSON esperado",
            };
          }
        }

        const response = await makeRequest(
          env,
          `api/users-permissions/roles/${id}`,
          "PUT",
          undefined,
          roleData,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao atualizar role: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data: responseData?.role || responseData?.data || responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao atualizar role",
        };
      }
    },
  });

export const createStrapiDeleteRoleTool = (env: Env) =>
  createTool({
    id: "STRAPI_DELETE_ROLE",
    description: "Exclui um role no Strapi CMS.",
    inputSchema: z.object({
      id: z
        .union([z.string(), z.number()])
        .describe("ID do role a ser excluído"),
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
          `api/users-permissions/roles/${id}`,
          "DELETE",
          undefined,
          undefined,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao excluir role: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data: responseData?.role || responseData?.data || responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao excluir role",
        };
      }
    },
  });

export const createStrapiGetPermissionsTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_PERMISSIONS",
    description: "Lista permissões disponíveis no Strapi CMS.",
    inputSchema: z.object({
      filters: z
        .string()
        .optional()
        .describe(
          "Filtros para a consulta de permissões (formato JSON string)",
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
    execute: async ({ context: { filters, sort, pagination } }) => {
      try {
        const params: Record<string, any> = {};

        if (filters) params.filters = filters;
        if (sort) params.sort = sort;
        if (pagination) params.pagination = pagination;

        const response = await makeRequest(
          env,
          "api/users-permissions/permissions",
          "GET",
          params,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar permissões: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          data: responseData?.permissions || responseData?.data || responseData,
          meta: responseData?.meta,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao buscar permissões",
        };
      }
    },
  });

export const strapiRolesTools = [
  createStrapiGetRolesTool,
  createStrapiGetRoleByIdTool,
  createStrapiCreateRoleTool,
  createStrapiUpdateRoleTool,
  createStrapiDeleteRoleTool,
  createStrapiGetPermissionsTool,
];
