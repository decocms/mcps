import { createPrivateTool } from "@decocms/runtime/tools";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { once } from "node:events";
import { join } from "node:path";
import { z } from "zod";
import {
  getInnertube,
  parseVideoId,
  wrapInnertubeError,
} from "../lib/innertube.ts";
import { getObjectStorage, putFile } from "../lib/storage.ts";
import type { Env } from "../types/env.ts";

const TMP_DIR = "/tmp/yt-dl";

function extensionFromMime(mimeType: string, isAudio: boolean): string {
  if (mimeType.includes("webm")) return isAudio ? "webm" : "webm";
  if (isAudio) return "m4a";
  return "mp4";
}

/** Streams a web ReadableStream to disk with a hard size cap. */
async function spoolToDisk(
  stream: ReadableStream<Uint8Array>,
  tmpPath: string,
  maxBytes: number,
): Promise<number> {
  const file = createWriteStream(tmpPath);
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        throw new Error(
          `Download exceeded the ${Math.round(maxBytes / 1024 / 1024)}MB limit. Retry with a lower quality, type "audio", or a higher maxSizeMB.`,
        );
      }
      if (!file.write(chunk)) await once(file, "drain");
    }
    file.end();
    await once(file, "finish");
    return bytes;
  } catch (error) {
    file.destroy();
    throw error;
  }
}

export const createDownloadVideoTool = (env: Env) =>
  createPrivateTool({
    id: "YOUTUBE_DOWNLOAD_VIDEO",
    description:
      "Download a YouTube video (or its audio) into the organization's object storage and return a shareable download URL. Requires the OBJECT_STORAGE binding. Note: combined audio+video streams top out at 360p/720p (YouTube serves higher resolutions as video-only DASH, which would require ffmpeg muxing — not supported); use type=audio for best-quality audio only.",
    inputSchema: z.object({
      videoId: z
        .string()
        .describe("YouTube video id (11 chars) or full video URL"),
      type: z
        .enum(["video+audio", "audio"])
        .default("video+audio")
        .describe(
          "video+audio = muxed stream (up to 360p/720p); audio = best audio-only stream",
        ),
      quality: z
        .string()
        .default("best")
        .describe(
          'Preferred quality: "best", "bestefficiency", or a label like "360p"/"720p" (only applies to type=video+audio)',
        ),
      itag: z.coerce
        .number()
        .int()
        .optional()
        .describe(
          "Exact format itag from YOUTUBE_GET_VIDEO_DETAILS.availableFormats (overrides quality)",
        ),
      maxSizeMB: z.coerce
        .number()
        .int()
        .min(1)
        .max(2048)
        .default(512)
        .describe("Abort if the file exceeds this size (default 512MB)"),
      expiresIn: z.coerce
        .number()
        .int()
        .min(60)
        .max(604800)
        .default(3600)
        .describe(
          "How long the returned download URL stays valid, in seconds (default 1h, max 7 days)",
        ),
    }),
    outputSchema: z.object({
      videoId: z.string(),
      title: z.string(),
      storageKey: z
        .string()
        .describe(
          "Key of the saved file in the org's object storage (reusable by other MCPs, e.g. youtube-channel-admin uploads)",
        ),
      downloadUrl: z
        .string()
        .describe(
          "Presigned URL to download the file directly (e.g. to your computer)",
        ),
      expiresIn: z.number(),
      sizeBytes: z.number(),
      mimeType: z.string(),
      qualityLabel: z.string().optional(),
    }),
    execute: async ({ context }) => {
      // Fail fast if storage isn't connected — before any YouTube work.
      const storage = getObjectStorage(env);
      const videoId = parseVideoId(context.videoId);
      const isAudio = context.type === "audio";

      const formatOptions = context.itag
        ? { itag: context.itag }
        : {
            type: context.type,
            quality: context.quality,
            format: "mp4" as const,
          };

      // The WEB client no longer exposes muxed (audio+video) streams —
      // ANDROID still serves itag 18 (360p). Try clients until one has a
      // matching format; download from that same client's session.
      const yt = await getInnertube();
      // deno-lint-ignore no-explicit-any
      let info: any;
      // deno-lint-ignore no-explicit-any
      let format: any;
      let lastError: unknown;
      for (const client of ["ANDROID", "IOS", "WEB"] as const) {
        try {
          const candidate = await yt.getInfo(videoId, { client });
          format = candidate.chooseFormat(formatOptions);
          info = candidate;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!info || !format) {
        throw new Error(
          `No matching downloadable format (${wrapInnertubeError(lastError).message}). Check availableFormats in YOUTUBE_GET_VIDEO_DETAILS — muxed streams are usually only 360p; use type=audio for audio-only.`,
        );
      }

      const mimeType =
        String(format?.mime_type ?? "").split(";")[0] ||
        (isAudio ? "audio/mp4" : "video/mp4");
      const extension = extensionFromMime(mimeType, isAudio);
      const storageKey = `youtube-search/downloads/${videoId}/${format?.itag ?? "stream"}.${extension}`;

      await mkdir(TMP_DIR, { recursive: true });
      const tmpPath = join(TMP_DIR, `${randomUUID()}.${extension}`);

      try {
        let stream: ReadableStream<Uint8Array>;
        try {
          stream = await info.download(formatOptions);
        } catch (error) {
          throw wrapInnertubeError(error);
        }

        await spoolToDisk(stream, tmpPath, context.maxSizeMB * 1024 * 1024);
        const { size } = await stat(tmpPath);

        await putFile(storage, {
          tmpPath,
          key: storageKey,
          contentType: mimeType,
        });

        const { url } = await storage.GET_PRESIGNED_URL({
          key: storageKey,
          expiresIn: context.expiresIn,
        });

        return {
          videoId,
          title: info.basic_info.title ?? "",
          storageKey,
          downloadUrl: url,
          expiresIn: context.expiresIn,
          sizeBytes: size,
          mimeType,
          qualityLabel:
            format?.quality_label ?? (isAudio ? "audio" : undefined),
        };
      } finally {
        await rm(tmpPath, { force: true }).catch(() => {});
      }
    },
  });
