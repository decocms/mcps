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

const VirtualTryOnInputSchema = z
  .object({
    personImageUrl: z
      .string()
      .url()
      .describe("URL of the person photo (full-body preferred)."),
    garments: z
      .preprocess(
        (val) => {
          // Handle empty string or null/undefined
          if (val === "" || val === null || val === undefined) return undefined;
          // Handle string that should be JSON array
          if (typeof val === "string") {
            try {
              return JSON.parse(val);
            } catch {
              return undefined;
            }
          }
          return val;
        },
        z
          .array(
            z.object({
              imageUrl: z.string().url().describe("URL of the garment image."),
              type: GarmentTypeSchema.optional()
                .default("unknown")
                .describe("Optional garment type hint."),
            }),
          )
          .optional(),
      )
      .describe("One or more garment reference images (URL-based)."),
    skuIds: z
      .preprocess((val) => {
        // Handle empty string or null/undefined
        if (val === "" || val === null || val === undefined) return undefined;
        // Handle string that should be JSON array
        if (typeof val === "string") {
          try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : undefined;
          } catch {
            return undefined;
          }
        }
        return val;
      }, z.array(z.coerce.number()).optional())
      .describe(
        "List of VTEX SKU IDs to fetch garment images from. Requires VTEX binding.",
      ),
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
      .describe("Optional model override to send to the generator."),
  })
  .refine(
    (data) => {
      const hasGarments = data.garments && data.garments.length > 0;
      const hasSkuIds = data.skuIds && data.skuIds.length > 0;
      return hasGarments || hasSkuIds;
    },
    {
      message:
        "At least one of 'garments' or 'skuIds' must be provided with items.",
    },
  );

type VirtualTryOnInput = z.infer<typeof VirtualTryOnInputSchema>;

interface GeneratorResult {
  image?: string;
  error?: boolean;
  finishReason?: string;
}

interface VtexSkuContextResponse {
  Id: number;
  ProductId: number;
  NameComplete: string;
  ImageUrl: string;
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

  return [
    "Virtual try-on (VTO).",
    "Use the first reference image as the person photo. Use the other reference images as garments to be worn by the person.",
    garmentLine,
    typeHint,
    preserveFace
      ? "Preserve the person's identity and face. Do NOT change facial features."
      : "Keep the person's identity consistent.",
    "IMPORTANT: Keep the COMPLETE framing from the original person photo. Do NOT crop or cut any part of the body.",
    "If the person photo is full-body, show the ENTIRE body from head to feet. Do NOT cut legs, feet, arms, or head.",
    "Maintain the exact same vertical and horizontal framing as the original person photo.",
    "Keep the original pose, body shape, proportions, and camera angle.",
    "Preserve the full height and width of the original photo - do not zoom in or change the composition.",
    "Render realistic fabric, folds, and lighting consistent with the person photo.",
    "Keep the outfit aligned to the body (no floating garments).",
    "Do not add text, watermarks, or logos.",
    userInstruction ? `Extra instruction: ${userInstruction}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Helper function to add timeout to MCP binding calls
 * MCP bindings don't support RequestInit signal, so we use Promise.race
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Helper function to add keepalive heartbeats during long-running operations
 * This prevents SSE connections from timing out by periodically logging progress
 */
async function withHeartbeat<T>(
  promise: Promise<T>,
  label: string,
  intervalMs = 5000,
): Promise<T> {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let elapsedSeconds = 0;

  try {
    // Start heartbeat timer
    heartbeatTimer = setInterval(() => {
      elapsedSeconds += intervalMs / 1000;
      console.log(
        `[${label}] ⏳ Still processing... (${elapsedSeconds}s elapsed)`,
      );
    }, intervalMs);

    // Wait for the promise to complete
    const result = await promise;

    return result;
  } finally {
    // Clean up heartbeat timer
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
    }
  }
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
        const executionId = Math.random().toString(36).substring(2, 8);
        console.log(
          `[VIRTUAL_TRY_ON:${executionId}] 🚀 Starting tool execution`,
        );
        console.log(`[VIRTUAL_TRY_ON:${executionId}] 📥 Input received:`, {
          personImageUrl: context.personImageUrl,
          garmentsCount: context.garments?.length ?? 0,
          garments: context.garments,
          skuIds: context.skuIds,
          instruction: context.instruction,
          preserveFace: context.preserveFace,
          preserveBackground: context.preserveBackground,
          aspectRatio: context.aspectRatio,
          model: context.model,
        });

        console.log("[VIRTUAL_TRY_ON] 🔍 Checking IMAGE_GENERATOR binding...");
        console.log(
          "[VIRTUAL_TRY_ON] env.MESH_REQUEST_CONTEXT exists?",
          !!env.MESH_REQUEST_CONTEXT,
        );
        console.log(
          "[VIRTUAL_TRY_ON] env.MESH_REQUEST_CONTEXT.state exists?",
          !!env.MESH_REQUEST_CONTEXT?.state,
        );

        const imageGenerator = env.MESH_REQUEST_CONTEXT?.state?.IMAGE_GENERATOR;
        console.log(
          "[VIRTUAL_TRY_ON] IMAGE_GENERATOR binding exists?",
          !!imageGenerator,
        );

        if (!imageGenerator) {
          console.error(
            "[VIRTUAL_TRY_ON] ❌ IMAGE_GENERATOR binding not found!",
          );
          console.error(
            "[VIRTUAL_TRY_ON] Available state:",
            env.MESH_REQUEST_CONTEXT?.state,
          );
          throw new Error(
            "IMAGE_GENERATOR binding is not configured. Please connect an image generator MCP (e.g., nanobanana) to the IMAGE_GENERATOR binding.",
          );
        }

        console.log("[VIRTUAL_TRY_ON] ✅ IMAGE_GENERATOR binding found");
        console.log("[VIRTUAL_TRY_ON] Checking for GENERATE_IMAGE tool...");

        if (!imageGenerator.GENERATE_IMAGE) {
          console.error(
            "[VIRTUAL_TRY_ON] ❌ Connected MCP does not provide GENERATE_IMAGE tool!",
          );
          throw new Error(
            "The connected IMAGE_GENERATOR MCP does not provide a GENERATE_IMAGE tool. Please connect a compatible image generator.",
          );
        }

        console.log("[VIRTUAL_TRY_ON] ✅ GENERATE_IMAGE tool available");

        // Fetch garment images from VTEX if skuIds provided
        let garmentUrls: string[] = [];
        let garmentTypes: string[] = [];

        if (context.skuIds && context.skuIds.length > 0) {
          console.log(
            `[VIRTUAL_TRY_ON] 🛒 Fetching images for ${context.skuIds.length} SKU(s) from VTEX...`,
          );
          console.log("[VIRTUAL_TRY_ON] SKU IDs:", context.skuIds);

          const vtexBinding = env.MESH_REQUEST_CONTEXT?.state?.VTEX;
          if (!vtexBinding) {
            console.error("[VIRTUAL_TRY_ON] ❌ VTEX binding not found!");
            throw new Error(
              "VTEX binding is not configured. Please connect the VTEX MCP to the VTEX binding to use skuIds.",
            );
          }

          console.log("[VIRTUAL_TRY_ON] ✅ VTEX binding found");

          if (!vtexBinding.VTEX_GET_SKU) {
            console.error("[VIRTUAL_TRY_ON] ❌ VTEX_GET_SKU tool not found!");
            throw new Error(
              "The VTEX binding does not provide VTEX_GET_SKU tool.",
            );
          }

          console.log("[VIRTUAL_TRY_ON] ✅ VTEX_GET_SKU tool available");

          // Fetch images for each SKU
          for (const skuId of context.skuIds) {
            console.log(`[VIRTUAL_TRY_ON] 📡 Fetching images for SKU ${skuId}`);
            try {
              const skuData = (await vtexBinding.VTEX_GET_SKU({
                skuId,
              })) as VtexSkuContextResponse;

              console.log(
                `[VIRTUAL_TRY_ON] ✅ SKU ${skuId} data received:`,
                skuData,
              );

              // skuContext returns ImageUrl directly — public CDN URL
              if (skuData.ImageUrl) {
                console.log(
                  `[VIRTUAL_TRY_ON] 🖼️  Extracted image URL for SKU ${skuId}:`,
                  skuData.ImageUrl,
                );
                garmentUrls.push(skuData.ImageUrl);
                garmentTypes.push("unknown");
              } else {
                console.warn(
                  `[VIRTUAL_TRY_ON] ⚠️  No ImageUrl found for SKU ${skuId}`,
                );
              }
            } catch (error) {
              console.error(
                `[VIRTUAL_TRY_ON] ❌ Error fetching SKU ${skuId}:`,
                error,
              );
              throw new Error(
                `Failed to fetch images for SKU ${skuId}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          console.log(
            `[VIRTUAL_TRY_ON] ✅ Fetched ${garmentUrls.length} garment image(s) from VTEX`,
          );
        }

        // Add URL-based garments if provided
        if (context.garments && context.garments.length > 0) {
          console.log(
            `[VIRTUAL_TRY_ON] 🖼️  Adding ${context.garments.length} URL-based garment(s)`,
          );
          garmentUrls.push(...context.garments.map((g) => g.imageUrl));
          garmentTypes.push(
            ...context.garments.map((g) => g.type ?? "unknown").filter(Boolean),
          );
        }

        console.log("[VIRTUAL_TRY_ON] 📝 Building prompt...");
        const prompt = buildTryOnPrompt({
          garmentsCount: garmentUrls.length,
          garmentTypes,
          userInstruction: context.instruction,
          preserveFace: context.preserveFace,
          preserveBackground: context.preserveBackground,
        });
        console.log("[VIRTUAL_TRY_ON] Generated prompt:", prompt);

        const baseImageUrls = [context.personImageUrl, ...garmentUrls];
        console.log("[VIRTUAL_TRY_ON] 🖼️  Base image URLs:", baseImageUrls);

        const modelToUse = context.model ?? "gemini-3-pro-image-preview";
        console.log("[VIRTUAL_TRY_ON] 🤖 Selected model:", modelToUse);

        console.log(
          "[VIRTUAL_TRY_ON] 📡 Calling IMAGE_GENERATOR.GENERATE_IMAGE...",
        );
        console.log("[VIRTUAL_TRY_ON] Call parameters:", {
          prompt,
          baseImageUrls,
          aspectRatio: context.aspectRatio,
          model: modelToUse,
        });

        const startTime = performance.now();
        try {
          console.log("[VIRTUAL_TRY_ON] ⏰ Starting IMAGE_GENERATOR call...");

          // VIRTUAL_TRY_ON timeout: 180 seconds (3 minutes)
          // This gives enough time for the generator's internal timeout + retries
          const VIRTUAL_TRY_ON_TIMEOUT_MS = 180_000;
          console.log(
            `[VIRTUAL_TRY_ON] ⏱️  Virtual try-on timeout: ${VIRTUAL_TRY_ON_TIMEOUT_MS / 1000}s`,
          );
          console.log(
            "[VIRTUAL_TRY_ON] ℹ️  IMAGE_GENERATOR may have its own internal timeout",
          );
          console.log(
            "[VIRTUAL_TRY_ON] 💓 Heartbeat enabled - will log every 5s to keep connection alive",
          );

          // Call the image generator binding
          const generatorPromise = imageGenerator.GENERATE_IMAGE({
            prompt,
            baseImageUrls,
            aspectRatio: context.aspectRatio,
            model: modelToUse,
          });

          // Wrap with both heartbeat and timeout
          const result = (await withTimeout(
            withHeartbeat(generatorPromise, "VIRTUAL_TRY_ON", 5000),
            VIRTUAL_TRY_ON_TIMEOUT_MS,
            `Virtual try-on timeout after ${VIRTUAL_TRY_ON_TIMEOUT_MS / 1000}s - IMAGE_GENERATOR did not respond in time`,
          )) as GeneratorResult;

          const duration = Math.round(performance.now() - startTime);
          console.log(
            `[VIRTUAL_TRY_ON] ✅ Response received from IMAGE_GENERATOR in ${duration}ms`,
          );
          console.log(
            "[VIRTUAL_TRY_ON] 📦 Full IMAGE_GENERATOR response:",
            result,
          );
          console.log("[VIRTUAL_TRY_ON] 📊 Response summary:", {
            hasImage: !!result.image,
            imageLength: result.image?.length,
            imagePreview: result.image?.substring(0, 100),
            error: result.error,
            finishReason: result.finishReason,
          });

          const response = {
            image: result.image,
            error: result.error,
            finishReason: result.finishReason,
          };

          console.log(
            `[VIRTUAL_TRY_ON:${executionId}] 📤 ABOUT TO RETURN response to client:`,
          );
          console.log(
            `[VIRTUAL_TRY_ON:${executionId}] Response object:`,
            JSON.stringify(response),
          );
          console.log(
            `[VIRTUAL_TRY_ON:${executionId}] 🏁 Tool execution completed successfully - returning now...`,
          );

          return response;
        } catch (error) {
          const duration = Math.round(performance.now() - startTime);
          console.error(
            `[VIRTUAL_TRY_ON] ❌ Error calling IMAGE_GENERATOR.GENERATE_IMAGE after ${duration}ms:`,
          );
          console.error("[VIRTUAL_TRY_ON] Full error:", error);
          console.error("[VIRTUAL_TRY_ON] Error type:", typeof error);
          console.error(
            "[VIRTUAL_TRY_ON] Error name:",
            error instanceof Error ? error.name : "N/A",
          );
          console.error(
            "[VIRTUAL_TRY_ON] Error message:",
            error instanceof Error ? error.message : String(error),
          );
          console.error(
            "[VIRTUAL_TRY_ON] Stack trace:",
            error instanceof Error ? error.stack : "N/A",
          );

          // Return structured error instead of throwing exception
          return {
            error: true,
            finishReason: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    }),
];
