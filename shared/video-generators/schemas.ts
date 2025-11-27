import { z } from "zod";

// Aspect Ratio Schema
export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

// Video Duration Schema
export const VideoDurationSchema = z.union([
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
]);
export type VideoDuration = z.infer<typeof VideoDurationSchema>;

// Generate Video Schemas
export const GenerateVideoInputSchema = z.object({
  prompt: z
    .string()
    .describe("The text prompt describing the video to generate"),
  baseImageUrl: z
    .string()
    .nullable()
    .optional()
    .describe(
      "URL of an existing image to use as base (image-to-video generation)",
    ),
  referenceImages: z
    .array(
      z.object({
        url: z.string(),
        referenceType: z.enum(["asset", "style"]).optional(),
      }),
    )
    .max(3)
    .optional()
    .describe("Up to 3 reference images to guide generation"),
  firstFrameUrl: z.string().optional().describe("URL of the first frame image"),
  lastFrameUrl: z.string().optional().describe("URL of the last frame image"),
  aspectRatio: AspectRatioSchema.optional().describe(
    "Aspect ratio for the generated video (default: 16:9)",
  ),
  duration: VideoDurationSchema.optional().describe(
    "Video duration in seconds (default: 8)",
  ),
  personGeneration: z
    .enum(["dont_allow", "allow_adult"])
    .optional()
    .describe("Control person generation in video"),
  negativePrompt: z.string().optional().describe("What to avoid in generation"),
});

export const GenerateVideoOutputSchema = z.object({
  video: z.string().optional().describe("URL of the generated video"),
  error: z.boolean().optional().describe("Whether the request failed"),
  finishReason: z.string().optional().describe("Native finish reason"),
  operationName: z.string().optional().describe("Operation name for tracking"),
});

export type GenerateVideoInput = z.infer<typeof GenerateVideoInputSchema>;
export type GenerateVideoOutput = z.infer<typeof GenerateVideoOutputSchema>;

// List Videos Schemas
export const ListVideosInputSchema = z.object({
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of videos to return (default: 20)"),
  after: z.string().optional().describe("Video ID for pagination cursor"),
});

export const ListVideosOutputSchema = z.object({
  videos: z.array(
    z.object({
      id: z.string().describe("Video ID"),
      status: z
        .string()
        .describe("Video status (completed, failed, processing, etc)"),
      prompt: z
        .string()
        .optional()
        .describe("Prompt used to generate the video"),
      model: z.string().describe("Model used"),
      created_at: z.number().describe("Creation timestamp"),
      duration: z.number().optional().describe("Video duration in seconds"),
      url: z.string().optional().describe("Video URL (if completed)"),
    }),
  ),
  has_more: z.boolean().describe("Indicates if more videos are available"),
  first_id: z.string().optional().describe("ID of the first video in the list"),
  last_id: z
    .string()
    .optional()
    .describe("ID of the last video (use as 'after' for next page)"),
});

export type ListVideosInput = z.infer<typeof ListVideosInputSchema>;
export type ListVideosOutput = z.infer<typeof ListVideosOutputSchema>;

// Extend Video Schemas
export const ExtendVideoInputSchema = z.object({
  videoId: z.string().describe("ID of the video to extend/remix"),
  prompt: z.string().describe("New prompt to guide the video extension"),
});

export const ExtendVideoOutputSchema = z.object({
  video: z.string().optional().describe("URL of the extended video"),
  error: z.boolean().optional().describe("Whether the request failed"),
  finishReason: z.string().optional().describe("Native finish reason"),
  operationName: z.string().optional().describe("Operation name for tracking"),
});

export type ExtendVideoInput = z.infer<typeof ExtendVideoInputSchema>;
export type ExtendVideoOutput = z.infer<typeof ExtendVideoOutputSchema>;
