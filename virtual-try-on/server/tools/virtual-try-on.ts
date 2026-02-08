import { z } from "zod";
import { createTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";

const GarmentTypeSchema = z.enum([
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
  "unknown",
]);

const VirtualTryOnInputSchema = z.object({
  personImageUrl: z
    .string()
    .url()
    .describe("URL of the person photo (full-body preferred)."),
  garments: z
    .array(
      z.object({
        imageUrl: z.string().url().describe("URL of the garment image."),
        type: GarmentTypeSchema.optional()
          .default("unknown")
          .describe("Optional garment type hint."),
      }),
    )
    .min(1)
    .describe("One or more garment reference images."),
  instruction: z
    .string()
    .optional()
    .describe(
      "Optional extra instruction (e.g., 'tuck the shirt', 'keep jacket open').",
    ),
  preserveFace: z
    .boolean()
    .default(true)
    .describe("Try to preserve the person's identity/face."),
  preserveBackground: z
    .boolean()
    .default(true)
    .describe("Try to keep the original background."),
  aspectRatio: z
    .enum([
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "21:9",
    ])
    .optional()
    .describe("Requested output aspect ratio (if supported by generator)."),
  model: z
    .string()
    .optional()
    .describe(
      "Optional model override to send to the generator (defaults to state.defaultModel).",
    ),
});

type VirtualTryOnInput = z.infer<typeof VirtualTryOnInputSchema>;

interface McpJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface McpJsonRpcResult {
  structuredContent?: GeneratorResult;
  content?: Array<{ type: string; text?: string }>;
}

interface McpJsonRpcResponse {
  jsonrpc: string;
  id?: number | string;
  error?: McpJsonRpcError;
  result?: McpJsonRpcResult;
}

interface GeneratorResult {
  image?: string;
  error?: boolean;
  finishReason?: string;
}

interface GeneratorConfig {
  url: string;
  authToken?: string;
  headers?: Record<string, string>;
  toolName: string;
  defaultModel: string;
}

interface ConnectionResponse {
  connection_url?: string;
  connection_token?: string | null;
  connection_headers?: Record<string, string> | null;
}

function buildTryOnPrompt(args: {
  garmentsCount: number;
  garmentTypes: string[];
  userInstruction?: string;
  preserveFace: boolean;
  preserveBackground: boolean;
}): string {
  const { garmentsCount, garmentTypes, userInstruction, preserveFace } = args;

  const garmentLine =
    garmentsCount === 1
      ? `There is 1 garment reference image.`
      : `There are ${garmentsCount} garment reference images.`;

  const typeHint =
    garmentTypes.length > 0
      ? `Garment types (best-effort): ${garmentTypes.join(", ")}.`
      : "";

  // Keep it generic; the model receives the images themselves as references.
  return [
    "Virtual try-on (VTO).",
    "Use the first reference image as the person photo. Use the other reference images as garments to be worn by the person.",
    garmentLine,
    typeHint,
    preserveFace
      ? "Preserve the person's identity and face. Do NOT change facial features."
      : "Keep the person's identity consistent.",
    "Keep the original pose, body shape, proportions, and camera angle.",
    "Render realistic fabric, folds, and lighting consistent with the person photo.",
    "Keep the outfit aligned to the body (no floating garments).",
    "Do not add text, watermarks, or logos.",
    userInstruction ? `Extra instruction: ${userInstruction}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function resolveGeneratorConfig(env: Env): Promise<GeneratorConfig> {
  console.log("[virtual-try-on] resolveGeneratorConfig called");
  const state = env.MESH_REQUEST_CONTEXT?.state;
  console.log("[virtual-try-on] state:", JSON.stringify(state, null, 2));

  const defaultToolName = state?.generatorToolName ?? "GENERATE_IMAGE";
  const defaultModel = state?.defaultModel ?? "gemini-2.5-flash-image-preview";

  // 1) Direct URL mode
  if (state?.generatorMcpUrl) {
    console.log(
      "[virtual-try-on] Using direct URL mode:",
      state.generatorMcpUrl,
    );
    return {
      url: state.generatorMcpUrl,
      authToken: state.generatorAuthToken ?? undefined,
      toolName: defaultToolName,
      defaultModel: defaultModel,
    };
  }

  // 2) Connection-binding mode
  const connectionId = state?.generatorConnectionId;
  const connectionBinding = state?.CONNECTION;
  console.log("[virtual-try-on] connectionId:", connectionId);
  console.log(
    "[virtual-try-on] connectionBinding exists:",
    !!connectionBinding,
  );

  if (connectionId && connectionBinding?.COLLECTION_CONNECTIONS_GET) {
    console.log("[virtual-try-on] Fetching connection...");
    const conn = (await connectionBinding.COLLECTION_CONNECTIONS_GET({
      id: connectionId,
    })) as ConnectionResponse;
    console.log(
      "[virtual-try-on] Connection response:",
      JSON.stringify(conn, null, 2),
    );

    const url = conn.connection_url;
    if (!url) {
      throw new Error(
        `Connection ${connectionId} did not return connection_url`,
      );
    }

    return {
      url,
      authToken: conn.connection_token ?? undefined,
      headers: conn.connection_headers ?? undefined,
      toolName: defaultToolName,
      defaultModel: defaultModel,
    };
  }

  throw new Error(
    "No generator configured. Set generatorMcpUrl OR set generatorConnectionId (and provide CONNECTION binding).",
  );
}

async function callGeneratorTool(args: {
  url: string;
  authToken?: string;
  headers?: Record<string, string>;
  toolName: string;
  toolArgs: Record<string, unknown>;
}): Promise<GeneratorResult> {
  const { url, authToken, headers, toolName, toolArgs } = args;
  const mcpRequest = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: toolName,
      arguments: toolArgs,
    },
    id: Date.now(),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(headers ?? {}),
    },
    body: JSON.stringify(mcpRequest),
  });

  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(`Generator MCP call failed: ${response.status} ${txt}`);
  }

  const payload = (await response.json()) as McpJsonRpcResponse;
  if (payload.error) {
    throw new Error(
      `Generator MCP error: ${payload.error.code} ${payload.error.message}`,
    );
  }

  // Prefer structured content, fallback to parsing the first content text.
  let result: GeneratorResult | undefined = payload.result?.structuredContent;

  if (!result && payload.result?.content?.[0]?.text) {
    try {
      result = JSON.parse(payload.result.content[0].text) as GeneratorResult;
    } catch {
      result = undefined;
    }
  }

  return result ?? {};
}

export const virtualTryOnTools = [
  (env: Env) =>
    createTool({
      id: "VIRTUAL_TRY_ON",
      description:
        "Generate a virtual try-on image: person photo + garment images (all URLs) -> generated image URL (delegates to an image generator MCP).",
      inputSchema: VirtualTryOnInputSchema,
      outputSchema: z.object({
        image: z.string().optional().describe("Generated try-on image URL."),
        error: z.boolean().optional(),
        finishReason: z.string().optional(),
      }),
      execute: async ({ context }: { context: VirtualTryOnInput }) => {
        console.log("[virtual-try-on] VIRTUAL_TRY_ON tool called");
        console.log(
          "[virtual-try-on] Input context:",
          JSON.stringify(context, null, 2),
        );

        try {
          const generator = await resolveGeneratorConfig(env);
          console.log(
            "[virtual-try-on] Generator config resolved:",
            JSON.stringify(generator, null, 2),
          );

          const garmentUrls = context.garments.map((g) => g.imageUrl);
          const garmentTypes = context.garments
            .map((g) => g.type ?? "unknown")
            .filter(Boolean);

          const prompt = buildTryOnPrompt({
            garmentsCount: garmentUrls.length,
            garmentTypes,
            userInstruction: context.instruction,
            preserveFace: context.preserveFace,
            preserveBackground: context.preserveBackground,
          });

          const baseImageUrls = [context.personImageUrl, ...garmentUrls];
          console.log(
            "[virtual-try-on] Calling generator with prompt:",
            prompt,
          );
          console.log("[virtual-try-on] baseImageUrls:", baseImageUrls);

          const result = await callGeneratorTool({
            url: generator.url,
            authToken: generator.authToken,
            headers: generator.headers,
            toolName: generator.toolName,
            toolArgs: {
              prompt,
              baseImageUrls,
              aspectRatio: context.aspectRatio,
              model: context.model ?? generator.defaultModel,
            },
          });

          console.log(
            "[virtual-try-on] Generator result:",
            JSON.stringify(result, null, 2),
          );

          // Expect shared image generator output format: { image, error?, finishReason? }
          return {
            image: result.image,
            error: result.error,
            finishReason: result.finishReason,
          };
        } catch (error) {
          console.error("[virtual-try-on] Error in VIRTUAL_TRY_ON:", error);
          throw error;
        }
      },
    }),
];
