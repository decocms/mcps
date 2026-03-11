import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import { getFluxApiKey } from "../lib/env.ts";
import { createFluxClient } from "../lib/flux-client.ts";

const FluxModels = [
  "flux-kontext-max",
  "flux-kontext-pro",
  "flux-2-pro-preview",
  "flux-2-pro",
  "flux-2-max",
  "flux-2-flex",
  "flux-pro-1.1",
  "flux-pro-1.1-ultra",
  "flux-dev",
] as const;

export const createGenerateImageTool = (env: Env) =>
  createPrivateTool({
    id: "generate_image",
    description:
      "Generate an image from a text prompt using FLUX models from Black Forest Labs. Supports reference images for style/content guidance. Returns a URL to the generated image (valid for 10 minutes — download it promptly).",
    inputSchema: z.object({
      prompt: z.string().describe("Text description of the image to generate"),
      model: z
        .enum(FluxModels)
        .optional()
        .describe(
          "FLUX model to use. Default: flux-kontext-max (best quality, supports reference images). Use flux-dev for faster/cheaper generation.",
        ),
      input_image: z
        .string()
        .optional()
        .describe(
          "Primary reference image as a base64-encoded string or URL. Used for style/content guidance or editing.",
        ),
      input_image_2: z
        .string()
        .optional()
        .describe("Second reference image (base64 or URL)."),
      input_image_3: z
        .string()
        .optional()
        .describe("Third reference image (base64 or URL)."),
      input_image_4: z
        .string()
        .optional()
        .describe("Fourth reference image (base64 or URL)."),
      aspect_ratio: z
        .string()
        .optional()
        .describe(
          "Aspect ratio (e.g. '16:9', '1:1', '9:16'). Used by Kontext and Ultra models instead of width/height.",
        ),
      width: z
        .number()
        .min(64)
        .max(1440)
        .optional()
        .describe(
          "Image width in pixels (must be multiple of 32). Default: 1024. Not used with Kontext/Ultra models — use aspect_ratio instead.",
        ),
      height: z
        .number()
        .min(64)
        .max(1440)
        .optional()
        .describe(
          "Image height in pixels (must be multiple of 32). Default: 768. Not used with Kontext/Ultra models — use aspect_ratio instead.",
        ),
      seed: z
        .number()
        .optional()
        .describe("Random seed for reproducible generation"),
      output_format: z
        .enum(["jpeg", "png"])
        .optional()
        .describe(
          "Output image format. Default: png for Kontext models, jpeg for others.",
        ),
      safety_tolerance: z
        .number()
        .min(0)
        .max(6)
        .optional()
        .describe(
          "Safety filter tolerance (0=strictest, 6=most permissive). Default: 2",
        ),
    }),
    outputSchema: z.object({
      image_url: z
        .string()
        .describe("URL to the generated image (valid for 10 minutes)"),
      model: z.string().describe("The model used for generation"),
      status: z.string().describe("Generation status"),
    }),
    execute: async ({ context }) => {
      const apiKey = getFluxApiKey(env);
      const client = createFluxClient({ apiKey });
      const model = context.model ?? "flux-kontext-max";

      const params: Record<string, unknown> = {
        prompt: context.prompt,
      };

      if (context.input_image !== undefined)
        params.input_image = context.input_image;
      if (context.input_image_2 !== undefined)
        params.input_image_2 = context.input_image_2;
      if (context.input_image_3 !== undefined)
        params.input_image_3 = context.input_image_3;
      if (context.input_image_4 !== undefined)
        params.input_image_4 = context.input_image_4;
      if (context.aspect_ratio !== undefined)
        params.aspect_ratio = context.aspect_ratio;
      if (context.width !== undefined) params.width = context.width;
      if (context.height !== undefined) params.height = context.height;
      if (context.seed !== undefined) params.seed = context.seed;
      if (context.output_format !== undefined)
        params.output_format = context.output_format;
      if (context.safety_tolerance !== undefined)
        params.safety_tolerance = context.safety_tolerance;

      const generation = await client.generateImage(model, params);
      const result = await client.pollResult(generation.polling_url);

      const imageUrl = result.result?.sample;
      if (!imageUrl) {
        throw new Error(
          "FLUX generation completed but no image URL was returned",
        );
      }

      return {
        image_url: imageUrl,
        model,
        status: result.status,
      };
    },
  });

export const generateTools = [createGenerateImageTool];
