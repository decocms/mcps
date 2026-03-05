import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { makeRequest } from "../../../lib/strapi.api.ts";
import { sanitizePathSegment } from "../../../lib/sanitize.ts";
import type { Env } from "../../../types/env.ts";

export const createStrapiContentTypesTool = (env: Env) =>
  createTool({
    id: "STRAPI_CONTENT_TYPES",
    description: "Lista todos os tipos de conteúdo disponíveis no Strapi CMS.",
    inputSchema: z.object({
      includeComponents: z
        .boolean()
        .optional()
        .describe("Incluir componentes na resposta"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      contentTypes: z.array(z.any()).optional(),
      components: z.array(z.any()).optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { includeComponents = false } }) => {
      try {
        const response = await makeRequest(
          env,
          "api/content-type-builder/content-types",
          "GET",
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar content types: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        const result: any = {
          success: true,
          contentTypes: responseData?.data || responseData,
        };

        if (includeComponents) {
          const componentsResponse = await makeRequest(
            env,
            "api/content-type-builder/components",
            "GET",
          );

          if (componentsResponse.success) {
            const componentsData = componentsResponse.data as any;
            result.components = componentsData?.data || componentsData;
          }
        }

        return result;
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || "Erro desconhecido ao buscar content types",
        };
      }
    },
  });

export const createStrapiContentTypeDetailTool = (env: Env) =>
  createTool({
    id: "STRAPI_CONTENT_TYPE_DETAIL",
    description:
      "Obtém detalhes de um tipo de conteúdo específico no Strapi CMS.",
    inputSchema: z.object({
      uid: z
        .string()
        .describe("UID do content type (ex: api::article.article)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      contentType: z.any().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: { uid } }) => {
      try {
        const safeUid = sanitizePathSegment(uid, "uid");
        const response = await makeRequest(
          env,
          `api/content-type-builder/content-types/${safeUid}`,
          "GET",
        );

        if (!response.success) {
          return {
            success: false,
            error: `Erro ao buscar detalhes do content type: ${response.status}`,
          };
        }

        const responseData = response.data as any;
        return {
          success: true,
          contentType: responseData?.data || responseData,
        };
      } catch (error: any) {
        return {
          success: false,
          error:
            error?.message ||
            "Erro desconhecido ao buscar detalhes do content type",
        };
      }
    },
  });

export const strapiContentTypesTools = [
  createStrapiContentTypesTool,
  createStrapiContentTypeDetailTool,
];
