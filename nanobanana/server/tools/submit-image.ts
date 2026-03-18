import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import { AspectRatioSchema } from "@decocms/mcps-shared/image-generators";
import type { Env } from "server/main.ts";
import { createGeminiClient, models, type Model } from "./utils/gemini.ts";
import { createTask, updateTask } from "./utils/task-store.ts";

/** Minimal interface for the resolved OBJECT_STORAGE binding */
interface ObjectStorageBinding {
  GET_PRESIGNED_URL: (input: {
    key: string;
    expiresIn?: number;
  }) => Promise<{ url: string; expiresIn: number }>;
  PUT_PRESIGNED_URL: (input: {
    key: string;
    expiresIn?: number;
    contentType?: string;
  }) => Promise<{ url: string; expiresIn: number }>;
}

function getObjectStorage(env: Env): ObjectStorageBinding {
  const storage = env.MESH_REQUEST_CONTEXT?.state?.OBJECT_STORAGE;
  if (!storage) {
    throw new Error(
      "OBJECT_STORAGE binding is not configured. Please connect an object-storage MCP.",
    );
  }
  return storage as unknown as ObjectStorageBinding;
}

const SubmitImageInputSchema = z.object({
  prompt: z
    .string()
    .describe("The text prompt describing the image to generate"),
  baseImageUrl: z
    .string()
    .nullable()
    .optional()
    .describe(
      "URL of an existing image to use as base (image-to-image generation)",
    ),
  baseImageUrls: z
    .array(z.string())
    .optional()
    .describe(
      "Array of image URLs to use as base (for multi-image generation like virtual try-on). If provided, takes precedence over baseImageUrl.",
    ),
  aspectRatio: AspectRatioSchema.optional().describe(
    "Aspect ratio for the generated image (default: 1:1)",
  ),
  model: z
    .enum(models.options)
    .optional()
    .describe(
      "Model to use for image generation (default: gemini-3.1-flash-image-preview)",
    ),
});

type SubmitImageInput = z.infer<typeof SubmitImageInputSchema>;

async function generateAndUpload(
  env: Env,
  taskId: string,
  context: SubmitImageInput,
): Promise<void> {
  try {
    const modelToUse = (context.model ??
      "gemini-3.1-flash-image-preview") as Model;
    const parsedModel: Model = models.parse(modelToUse);

    const imageUrls = context.baseImageUrls?.length
      ? context.baseImageUrls
      : context.baseImageUrl
        ? [context.baseImageUrl]
        : undefined;

    console.log(
      `[submit_image] Generating image: model=${parsedModel}, prompt="${context.prompt.slice(0, 80)}"`,
    );

    const client = createGeminiClient(env);
    const result = await client.generateImage(
      context.prompt,
      imageUrls,
      context.aspectRatio,
      parsedModel,
    );

    if (!result.imageData) {
      updateTask(taskId, {
        status: "Error",
        error: `No image returned. finishReason=${result.finishReason}`,
      });
      return;
    }

    const mimeType = result.mimeType ?? "image/png";
    const extension = mimeType.split("/")[1] || "png";
    const name = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `images/${name}.${extension}`;

    const objectStorage = getObjectStorage(env);

    const [readResult, writeResult] = await Promise.all([
      objectStorage.GET_PRESIGNED_URL({ key: path, expiresIn: 3600 }),
      objectStorage.PUT_PRESIGNED_URL({
        key: path,
        expiresIn: 300,
        contentType: mimeType,
      }),
    ]);

    const base64Data = result.imageData.includes(",")
      ? result.imageData.split(",")[1]
      : result.imageData;
    const imageBuffer = Buffer.from(base64Data!, "base64");

    const uploadResponse = await fetch(writeResult.url, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: imageBuffer,
    });

    if (!uploadResponse.ok) {
      const body = await uploadResponse.text().catch(() => "(no body)");
      updateTask(taskId, {
        status: "Error",
        error: `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} — ${body}`,
      });
      return;
    }

    updateTask(taskId, {
      status: "Ready",
      image_url: readResult.url,
    });

    console.log(`[submit_image] Task ${taskId} completed successfully`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[submit_image] Task ${taskId} failed:`, message);
    updateTask(taskId, {
      status: "Error",
      error: message,
    });
  }
}

const createSubmitImageTool = (env: Env) =>
  createPrivateTool({
    id: "submit_image",
    description:
      "Submit an image generation request using Gemini models via OpenRouter. Returns a request_id immediately — use get_image_result to poll for the result.",
    inputSchema: SubmitImageInputSchema,
    outputSchema: z.object({
      request_id: z
        .string()
        .describe(
          "The request ID to use with get_image_result to check status and retrieve the generated image",
        ),
      model: z.string().describe("The model used for generation"),
    }),
    execute: async ({ context }: { context: SubmitImageInput }) => {
      const taskId = createTask();
      const modelToUse = context.model ?? "gemini-3.1-flash-image-preview";

      // Fire and forget — generation runs in background
      generateAndUpload(env, taskId, context);

      return {
        request_id: taskId,
        model: modelToUse,
      };
    },
  });

export const submitImageTools = [createSubmitImageTool];
