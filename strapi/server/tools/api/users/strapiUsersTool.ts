import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import type { Env } from "../../../types/env.ts";

export const createStrapiGetUsersTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_USERS",
    description: "Lista usuários do Strapi CMS com filtros e paginação.",
    inputSchema: z.object({
      filters: z
        .string()
        .optional()
        .describe("Filtros para a consulta de usuários (formato JSON string)"),
      populate: z
        .string()
        .optional()
        .describe(
          'Campos para popular (formato: "role" ou JSON string para populate profundo)',
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
    execute: async ({ context: { filters, populate, sort, pagination } }) => {
      try {
        const params: Record<string, any> = {};

        if (filters) params.filters = filters;
        if (populate) params.populate = populate;
        if (sort) params.sort = sort;
        if (pagination) params.pagination = pagination;

        const response = await makeRequest(env, "api/users", "GET", params);

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar usuários: ${response.status}`,
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
          error: error?.message || "Erro desconhecido ao buscar usuários",
        };
      }
    },
  });

export const createStrapiGetUserByIdTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_USER_BY_ID",
    description: "Obtém um usuário específico por ID no Strapi CMS.",
    inputSchema: z.object({
      id: z.union([z.string(), z.number()]).describe("ID do usuário"),
      populate: z
        .string()
        .optional()
        .describe(
          'Campos para popular (formato: "role" ou JSON string para populate profundo)',
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { id, populate } }) => {
      try {
        const params: Record<string, any> = {};
        if (populate) params.populate = populate;

        const response = await makeRequest(
          env,
          `api/users/${id}`,
          "GET",
          params,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar usuário: ${response.status}`,
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
          error: error?.message || "Erro desconhecido ao buscar usuário",
        };
      }
    },
  });

export const createStrapiGetCurrentUserTool = (env: Env) =>
  createTool({
    id: "STRAPI_GET_CURRENT_USER",
    description:
      "Obtém informações do usuário atual autenticado no Strapi CMS.",
    inputSchema: z.object({
      populate: z
        .string()
        .optional()
        .describe(
          'Campos para popular (formato: "role" ou JSON string para populate profundo)',
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { populate } }) => {
      try {
        const params: Record<string, any> = {};
        if (populate) params.populate = populate;

        const response = await makeRequest(env, "api/users/me", "GET", params);

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar usuário atual: ${response.status}`,
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
          error: error?.message || "Erro desconhecido ao buscar usuário atual",
        };
      }
    },
  });

export const createStrapiCreateUserTool = (env: Env) =>
  createTool({
    id: "STRAPI_CREATE_USER",
    description: "Cria um novo usuário no Strapi CMS.",
    inputSchema: z.object({
      username: z.string().describe("Nome de usuário"),
      email: z.string().email().describe("Email do usuário"),
      password: z.string().describe("Senha do usuário"),
      confirmed: z
        .boolean()
        .optional()
        .describe("Se o usuário está confirmado"),
      blocked: z.boolean().optional().describe("Se o usuário está bloqueado"),
      role: z
        .union([z.string(), z.number()])
        .optional()
        .describe("ID ou nome do role"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { username, email, password, confirmed, blocked, role },
    }) => {
      try {
        const userData: any = {
          username,
          email,
          password,
        };

        if (confirmed !== undefined) userData.confirmed = confirmed;
        if (blocked !== undefined) userData.blocked = blocked;
        if (role !== undefined) userData.role = role;

        const response = await makeRequest(
          env,
          "api/users",
          "POST",
          undefined,
          userData,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao criar usuário: ${response.status}`,
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
          error: error?.message || "Erro desconhecido ao criar usuário",
        };
      }
    },
  });

export const createStrapiUpdateUserTool = (env: Env) =>
  createTool({
    id: "STRAPI_UPDATE_USER",
    description: "Atualiza um usuário existente no Strapi CMS.",
    inputSchema: z.object({
      id: z
        .union([z.string(), z.number()])
        .describe("ID do usuário a ser atualizado"),
      username: z.string().optional().describe("Nome de usuário"),
      email: z.string().email().optional().describe("Email do usuário"),
      password: z.string().optional().describe("Nova senha do usuário"),
      confirmed: z
        .boolean()
        .optional()
        .describe("Se o usuário está confirmado"),
      blocked: z.boolean().optional().describe("Se o usuário está bloqueado"),
      role: z
        .union([z.string(), z.number()])
        .optional()
        .describe("ID ou nome do role"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({
      context: { id, username, email, password, confirmed, blocked, role },
    }) => {
      try {
        const userData: any = {};

        if (username !== undefined) userData.username = username;
        if (email !== undefined) userData.email = email;
        if (password !== undefined) userData.password = password;
        if (confirmed !== undefined) userData.confirmed = confirmed;
        if (blocked !== undefined) userData.blocked = blocked;
        if (role !== undefined) userData.role = role;

        const response = await makeRequest(
          env,
          `api/users/${id}`,
          "PUT",
          undefined,
          userData,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao atualizar usuário: ${response.status}`,
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
          error: error?.message || "Erro desconhecido ao atualizar usuário",
        };
      }
    },
  });

export const createStrapiDeleteUserTool = (env: Env) =>
  createTool({
    id: "STRAPI_DELETE_USER",
    description: "Exclui um usuário no Strapi CMS.",
    inputSchema: z.object({
      id: z
        .union([z.string(), z.number()])
        .describe("ID do usuário a ser excluído"),
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
          `api/users/${id}`,
          "DELETE",
          undefined,
          undefined,
          true,
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao excluir usuário: ${response.status}`,
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
          error: error?.message || "Erro desconhecido ao excluir usuário",
        };
      }
    },
  });

export const strapiUsersTools = [
  createStrapiGetUsersTool,
  createStrapiGetUserByIdTool,
  createStrapiGetCurrentUserTool,
  createStrapiCreateUserTool,
  createStrapiUpdateUserTool,
  createStrapiDeleteUserTool,
];
