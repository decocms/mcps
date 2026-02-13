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
    .describe("Optional model override to send to the generator."),
});

type VirtualTryOnInput = z.infer<typeof VirtualTryOnInputSchema>;

interface GeneratorResult {
  image?: string;
  error?: boolean;
  finishReason?: string;
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
    "Keep the original pose, body shape, proportions, and camera angle.",
    "Render realistic fabric, folds, and lighting consistent with the person photo.",
    "Keep the outfit aligned to the body (no floating garments).",
    "Do not add text, watermarks, or logos.",
    userInstruction ? `Extra instruction: ${userInstruction}` : "",
  ]
    .filter(Boolean)
    .join("\n");
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
        console.log("[VIRTUAL_TRY_ON] 🚀 Starting tool execution");
        console.log("[VIRTUAL_TRY_ON] 📥 Input received:", {
          personImageUrl: context.personImageUrl,
          garmentsCount: context.garments.length,
          garments: context.garments,
          instruction: context.instruction,
          preserveFace: context.preserveFace,
          preserveBackground: context.preserveBackground,
          aspectRatio: context.aspectRatio,
          model: context.model,
        });

        console.log("[VIRTUAL_TRY_ON] 🔍 Checking NANOBANANA binding...");
        console.log(
          "[VIRTUAL_TRY_ON] env.MESH_REQUEST_CONTEXT exists?",
          !!env.MESH_REQUEST_CONTEXT,
        );
        console.log(
          "[VIRTUAL_TRY_ON] env.MESH_REQUEST_CONTEXT.state exists?",
          !!env.MESH_REQUEST_CONTEXT?.state,
        );

        const nanobanana = env.MESH_REQUEST_CONTEXT?.state?.NANOBANANA;
        console.log(
          "[VIRTUAL_TRY_ON] NANOBANANA binding exists?",
          !!nanobanana,
        );

        if (!nanobanana) {
          console.error("[VIRTUAL_TRY_ON] ❌ NANOBANANA binding not found!");
          console.error(
            "[VIRTUAL_TRY_ON] Available state:",
            env.MESH_REQUEST_CONTEXT?.state,
          );
          throw new Error(
            "NANOBANANA binding is not configured. Please connect a nanobanana MCP.",
          );
        }

        const garmentUrls = context.garments.map((g) => g.imageUrl);
        const garmentTypes = context.garments
          .map((g) => g.type ?? "unknown")
          .filter(Boolean);

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

        console.log("[VIRTUAL_TRY_ON] 📡 Calling NANOBANANA.GENERATE_IMAGE...");
        console.log("[VIRTUAL_TRY_ON] Call parameters:", {
          prompt,
          baseImageUrls,
          aspectRatio: context.aspectRatio,
          model: modelToUse,
        });

        const startTime = performance.now();
        try {
          console.log("[VIRTUAL_TRY_ON] ⏰ Starting NANOBANANA call...");

          // Custom timeout of 180 seconds (3 minutes) for image generation
          // using AbortSignal.timeout() in RequestInit
          const TIMEOUT_MS = 180_000; // 3 minutes
          console.log(
            `[VIRTUAL_TRY_ON] ⏱️  Timeout configured to ${TIMEOUT_MS / 1000}s`,
          );

          const result = (await nanobanana.GENERATE_IMAGE(
            {
              prompt,
              baseImageUrls,
              aspectRatio: context.aspectRatio,
              model: modelToUse,
            },
            {
              signal: AbortSignal.timeout(TIMEOUT_MS),
            },
          )) as GeneratorResult;

          const duration = Math.round(performance.now() - startTime);
          console.log(
            `[VIRTUAL_TRY_ON] ✅ Response received from NANOBANANA in ${duration}ms:`,
            {
              hasImage: !!result.image,
              imageLength: result.image?.length,
              error: result.error,
              finishReason: result.finishReason,
            },
          );

          return {
            image: result.image,
            error: result.error,
            finishReason: result.finishReason,
          };
        } catch (error) {
          const duration = Math.round(performance.now() - startTime);
          console.error(
            `[VIRTUAL_TRY_ON] ❌ Error calling NANOBANANA.GENERATE_IMAGE after ${duration}ms:`,
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
