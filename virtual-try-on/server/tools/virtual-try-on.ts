import { z } from "zod";
import { createTool } from "@decocms/runtime/tools";
import type { Env } from "../main.ts";

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

type McpJsonRpcResponse = {
  jsonrpc: string;
  id?: number | string;
  error?: { code: number; message: string; data?: unknown };
  result?: {
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
  };
};

function buildTryOnPrompt(args: {
  garmentsCount: number;
  garmentTypes: string[];
  userInstruction?: string;
  preserveFace: boolean;
  preserveBackground: boolean;
}) {
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

async function resolveGeneratorConfig(env: Env) {
  const state = env.MESH_REQUEST_CONTEXT?.state;
  const stateAny = state as any;

  // 1) Direct URL mode
  if (stateAny?.generatorMcpUrl) {
    return {
      url: stateAny.generatorMcpUrl as string,
      authToken:
        (stateAny.generatorAuthToken as string | undefined) || undefined,
      toolName: (stateAny.generatorToolName as string) || "GENERATE_IMAGE",
      defaultModel:
        (stateAny.defaultModel as string) || "gemini-2.5-flash-image-preview",
    };
  }

  // 2) Connection-binding mode
  const connectionId = stateAny?.generatorConnectionId as string | undefined;
  const connectionBinding = stateAny?.CONNECTION;
  if (connectionId && connectionBinding?.COLLECTION_CONNECTIONS_GET) {
    const conn = await connectionBinding.COLLECTION_CONNECTIONS_GET({
      id: connectionId,
    });
    const url = conn.connection_url as string | undefined;
    if (!url) {
      throw new Error(
        `Connection ${connectionId} did not return connection_url`,
      );
    }
    const token = conn.connection_token as string | null | undefined;
    const hdrs = conn.connection_headers as
      | Record<string, string>
      | null
      | undefined;
    return {
      url,
      authToken: token || undefined,
      headers: hdrs || undefined,
      toolName: (stateAny.generatorToolName as string) || "GENERATE_IMAGE",
      defaultModel:
        (stateAny.defaultModel as string) || "gemini-2.5-flash-image-preview",
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
}) {
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
      ...(headers || {}),
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
  const result =
    payload.result?.structuredContent ??
    (payload.result?.content?.[0]?.text
      ? JSON.parse(payload.result.content[0].text)
      : undefined);

  return result as any;
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
        const generator = await resolveGeneratorConfig(env);

        const garmentUrls = context.garments.map((g) => g.imageUrl);
        const garmentTypes = context.garments
          .map((g) => g.type || "unknown")
          .filter(Boolean);

        const prompt = buildTryOnPrompt({
          garmentsCount: garmentUrls.length,
          garmentTypes,
          userInstruction: context.instruction,
          preserveFace: context.preserveFace,
          preserveBackground: context.preserveBackground,
        });

        const baseImageUrls = [context.personImageUrl, ...garmentUrls];

        const result = await callGeneratorTool({
          url: generator.url,
          authToken: generator.authToken,
          headers: generator.headers,
          toolName: generator.toolName,
          toolArgs: {
            prompt,
            baseImageUrls,
            aspectRatio: context.aspectRatio,
            model: context.model || generator.defaultModel,
          },
        });

        // Expect shared image generator output format: { image, error?, finishReason? }
        return {
          image: result?.image,
          error: result?.error,
          finishReason: result?.finishReason,
        };
      },
    }),
];
