import { createPrivateTool } from "@decocms/runtime/tools";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { join } from "node:path";
import { z } from "zod";
import { UPLOAD_API_BASE } from "../constants.ts";
import { getAccessToken } from "../lib/auth.ts";
import type { Env } from "../types/env.ts";

const TMP_DIR = "/tmp/yt-upload";

interface ObjectStorageBinding {
  GET_PRESIGNED_URL: (input: {
    key: string;
    expiresIn?: number;
  }) => Promise<{ url: string }>;
}

/** Resolves the video source to a fetchable URL. */
async function resolveSourceUrl(
  env: Env,
  context: { videoUrl?: string; storageKey?: string },
): Promise<string> {
  if (context.videoUrl) return context.videoUrl;
  if (!context.storageKey) {
    throw new Error("Pass either videoUrl or storageKey.");
  }
  const storage = env.MESH_REQUEST_CONTEXT?.state?.OBJECT_STORAGE as
    | ObjectStorageBinding
    | undefined;
  if (!storage) {
    throw new Error(
      "storageKey requires the OBJECT_STORAGE binding. Connect an object-storage MCP or pass videoUrl instead.",
    );
  }
  const { url } = await storage.GET_PRESIGNED_URL({
    key: context.storageKey,
    expiresIn: 3600,
  });
  return url;
}

/**
 * Spools the source to /tmp so the resumable PUT gets an exact
 * Content-Length (Google rejects chunked transfer encoding).
 */
async function spoolSource(
  sourceUrl: string,
  maxBytes: number,
): Promise<{ tmpPath: string; sizeBytes: number; contentType: string }> {
  const response = await fetch(sourceUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Could not fetch video source (${response.status})`);
  }
  const contentType =
    response.headers.get("content-type")?.split(";")[0] ?? "video/mp4";

  await mkdir(TMP_DIR, { recursive: true });
  const tmpPath = join(TMP_DIR, `${randomUUID()}`);
  const file = createWriteStream(tmpPath);
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        throw new Error(
          `Video source exceeded the ${Math.round(maxBytes / 1024 / 1024)}MB limit — raise maxSizeMB if intentional.`,
        );
      }
      if (!file.write(value)) await once(file, "drain");
    }
    file.end();
    await once(file, "finish");
  } catch (error) {
    file.destroy();
    await rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
  const { size } = await stat(tmpPath);
  return { tmpPath, sizeBytes: size, contentType };
}

interface InsertedVideo {
  id?: string;
  status?: { uploadStatus?: string; privacyStatus?: string };
}

export const createUploadVideoTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_ADMIN_UPLOAD_VIDEO",
    description:
      "Upload a video to the authorized channel via resumable upload. Source is a public URL (videoUrl) or a file in the org's object storage (storageKey — e.g. saved by youtube-search's download tool). Defaults to PRIVATE so you can review before publishing. Quota: 1600 units per upload (default daily quota is 10k) — do NOT call this in a loop.",
    inputSchema: z.object({
      videoUrl: z
        .string()
        .optional()
        .describe("Public/presigned URL of the video file"),
      storageKey: z
        .string()
        .optional()
        .describe("Key of a video file in the connected OBJECT_STORAGE"),
      title: z.string().min(1).max(100),
      description: z.string().max(5000).optional(),
      tags: z.array(z.string()).optional(),
      categoryId: z
        .string()
        .default("22")
        .describe("YouTube category id (default 22 = People & Blogs)"),
      privacyStatus: z
        .enum(["private", "unlisted", "public"])
        .default("private"),
      madeForKids: z.boolean().default(false),
      notifySubscribers: z
        .boolean()
        .default(false)
        .describe(
          "Whether subscribers are notified (only matters for public videos)",
        ),
      maxSizeMB: z.coerce
        .number()
        .int()
        .min(1)
        .max(4096)
        .default(1024)
        .describe("Abort if the source file exceeds this size (default 1GB)"),
    }),
    outputSchema: z.object({
      videoId: z.string(),
      watchUrl: z.string(),
      uploadStatus: z.string().optional(),
      privacyStatus: z.string().optional(),
      sizeBytes: z.number(),
    }),
    execute: async ({ context }) => {
      const token = getAccessToken(env);
      const sourceUrl = await resolveSourceUrl(env, context);
      const { tmpPath, sizeBytes, contentType } = await spoolSource(
        sourceUrl,
        context.maxSizeMB * 1024 * 1024,
      );

      try {
        // Step 1: open the resumable session with the metadata.
        const sessionUrl = new URL(`${UPLOAD_API_BASE}/videos`);
        sessionUrl.searchParams.set("uploadType", "resumable");
        sessionUrl.searchParams.set("part", "snippet,status");
        sessionUrl.searchParams.set(
          "notifySubscribers",
          String(context.notifySubscribers),
        );

        const sessionResponse = await fetch(sessionUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": contentType,
            "X-Upload-Content-Length": String(sizeBytes),
          },
          body: JSON.stringify({
            snippet: {
              title: context.title,
              description: context.description ?? "",
              tags: context.tags,
              categoryId: context.categoryId,
            },
            status: {
              privacyStatus: context.privacyStatus,
              selfDeclaredMadeForKids: context.madeForKids,
            },
          }),
        });
        if (!sessionResponse.ok) {
          throw new Error(
            `Could not start resumable upload (${sessionResponse.status}): ${await sessionResponse.text()}`,
          );
        }
        const uploadUrl = sessionResponse.headers.get("location");
        if (!uploadUrl) {
          throw new Error("Resumable session did not return an upload URL.");
        }

        // Step 2: send the bytes (Bun.file streams from disk and sets
        // the exact Content-Length).
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: Bun.file(tmpPath),
        });
        if (!uploadResponse.ok) {
          throw new Error(
            `Video byte upload failed (${uploadResponse.status}): ${await uploadResponse.text()}`,
          );
        }
        const video = (await uploadResponse.json()) as InsertedVideo;
        if (!video.id) {
          throw new Error("Upload finished but no video id was returned.");
        }

        return {
          videoId: video.id,
          watchUrl: `https://www.youtube.com/watch?v=${video.id}`,
          uploadStatus: video.status?.uploadStatus,
          privacyStatus: video.status?.privacyStatus,
          sizeBytes,
        };
      } finally {
        await rm(tmpPath, { force: true }).catch(() => {});
      }
    },
  });
