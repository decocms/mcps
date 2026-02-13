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
        const nanobanana = env.MESH_REQUEST_CONTEXT?.state?.NANOBANANA;
        if (!nanobanana) {
          throw new Error(
            "NANOBANANA binding is not configured. Please connect a nanobanana MCP.",
          );
        }

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

        const result = (await nanobanana.GENERATE_IMAGE({
          prompt,
          baseImageUrls,
          aspectRatio: context.aspectRatio,
          model: context.model ?? "gemini-3-pro-image-preview",
        })) as GeneratorResult;

        return {
          image: result.image,
          error: result.error,
          finishReason: result.finishReason,
        };
      },
    }),
];
