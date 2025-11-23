import { z } from "zod";
import type { Contract, ContractClause } from "./middleware.ts";

// ============================================================================
// Environment and Configuration Interfaces
// ============================================================================

export interface ImageAnalyzerEnv {
  DECO_REQUEST_CONTEXT: {
    ensureAuthenticated: () => any;
    state: any;
  };
  DECO_CHAT_WORKSPACE: string;
}

// ============================================================================
// Zod Schemas
// ============================================================================

// Analyze Image Schemas
export const AnalyzeImageInputSchema = z.object({
  imageUrl: z.string().url().describe("URL da imagem a ser analisada"),
  prompt: z
    .string()
    .describe(
      "Prompt descrevendo o que você quer saber sobre a imagem. Ex: 'Descreva esta imagem em detalhes', 'Que objetos você vê nesta imagem?', 'Leia o texto nesta imagem'",
    ),
  model: z
    .string()
    .optional()
    .describe("Modelo a usar (opcional, depende do provider)"),
});

export const AnalyzeImageOutputSchema = z.object({
  analysis: z.string().describe("Análise da imagem"),
  finishReason: z.string().optional().describe("Razão do término"),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      totalTokenCount: z.number().optional(),
    })
    .optional()
    .describe("Metadados de uso de tokens"),
});

export type AnalyzeImageInput = z.infer<typeof AnalyzeImageInputSchema>;
export type AnalyzeImageOutput = z.infer<typeof AnalyzeImageOutputSchema>;

// Compare Images Schemas
export const CompareImagesInputSchema = z.object({
  imageUrls: z
    .array(z.string().url())
    .min(2)
    .describe("Array de URLs das imagens a serem comparadas (mínimo 2)"),
  prompt: z
    .string()
    .describe(
      "Prompt descrevendo como comparar as imagens. Ex: 'Quais são as diferenças entre estas imagens?', 'Estas imagens mostram a mesma pessoa?'",
    ),
  model: z
    .string()
    .optional()
    .describe("Modelo a usar (opcional, depende do provider)"),
});

export const CompareImagesOutputSchema = z.object({
  comparison: z.string().describe("Comparação das imagens"),
  finishReason: z.string().optional().describe("Razão do término"),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      totalTokenCount: z.number().optional(),
    })
    .optional()
    .describe("Metadados de uso de tokens"),
});

export type CompareImagesInput = z.infer<typeof CompareImagesInputSchema>;
export type CompareImagesOutput = z.infer<typeof CompareImagesOutputSchema>;

// Extract Text (OCR) Schemas
export const ExtractTextInputSchema = z.object({
  imageUrl: z
    .string()
    .url()
    .describe("URL da imagem contendo texto a ser extraído"),
  language: z
    .string()
    .optional()
    .describe(
      "Idioma do texto na imagem (opcional). Ex: 'português', 'inglês'",
    ),
  model: z
    .string()
    .optional()
    .describe("Modelo a usar (opcional, depende do provider)"),
});

export const ExtractTextOutputSchema = z.object({
  text: z.string().describe("Texto extraído da imagem"),
  finishReason: z.string().optional().describe("Razão do término"),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      totalTokenCount: z.number().optional(),
    })
    .optional()
    .describe("Metadados de uso de tokens"),
});

export type ExtractTextInput = z.infer<typeof ExtractTextInputSchema>;
export type ExtractTextOutput = z.infer<typeof ExtractTextOutputSchema>;

// ============================================================================
// Tool Configuration Interfaces
// ============================================================================

/**
 * Configuration for analyze image tool
 */
export interface AnalyzeImageToolConfig<
  TEnv extends ImageAnalyzerEnv,
  TClient = unknown,
> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: AnalyzeImageInput;
    client: TClient;
  }) => Promise<AnalyzeImageOutput>;
  getContract?: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

/**
 * Configuration for compare images tool
 */
export interface CompareImagesToolConfig<
  TEnv extends ImageAnalyzerEnv,
  TClient = unknown,
> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: CompareImagesInput;
    client: TClient;
  }) => Promise<CompareImagesOutput>;
  getContract?: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

/**
 * Configuration for extract text tool
 */
export interface ExtractTextToolConfig<
  TEnv extends ImageAnalyzerEnv,
  TClient = unknown,
> {
  execute: ({
    env,
    input,
    client,
  }: {
    env: TEnv;
    input: ExtractTextInput;
    client: TClient;
  }) => Promise<ExtractTextOutput>;
  getContract?: (env: TEnv) => {
    binding: Contract;
    clause: ContractClause;
  };
}

/**
 * Options for creating image analyzer tools
 */
export interface CreateImageAnalyzerOptions<
  TEnv extends ImageAnalyzerEnv,
  TClient = unknown,
> {
  metadata: {
    provider: string;
    description?: string;
  };
  getClient: (env: TEnv) => TClient;
  analyzeTool: AnalyzeImageToolConfig<TEnv, TClient>;
  compareTool?: CompareImagesToolConfig<TEnv, TClient>;
  extractTextTool?: ExtractTextToolConfig<TEnv, TClient>;
}
