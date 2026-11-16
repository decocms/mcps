import { createHash } from "node:crypto";
import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { parseCanvas } from "../lib/fig.ts";
import { cacheDoc, checkId, infoOf, keys, writeInfo } from "../lib/files.ts";
import { deleteKeys, getBytes, putBytes } from "../lib/storage.ts";
import type { Env } from "../types/env.ts";
import { listFiles } from "./read.ts";

export const IMPORT_RESOURCE_URI = "ui://figma-file/import";

/** Max decoded bytes per upload chunk (base64 adds ~33% on the wire). */
export const CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_PARTS = 64; // 128 MB of canvas.fig — far above real files (~12 MB for 60k nodes)

const id = z
  .string()
  .regex(/^[0-9a-f]{16}$/)
  .describe("First 16 hex chars of the sha256 of canvas.fig");

export const importTool = (env: Env) =>
  createPrivateTool({
    id: "figma_import",
    title: "Importar arquivo do Figma",
    description:
      "Opens a guided UI that teaches the user how to export a Figma file as .fig (File > Save local copy, on figma.com or the desktop app) and upload it. Call this whenever the user wants to work with a Figma file that is not in figma_list_files yet. After the upload, use the read tools with the returned file id.",
    inputSchema: z.object({}),
    _meta: { ui: { resourceUri: IMPORT_RESOURCE_URI } },
    annotations: { readOnlyHint: true, openWorldHint: false },
    execute: async () => ({
      files: await listFiles(env),
      message:
        "Import UI opened. Wait for the user to upload the .fig, then call figma_list_files.",
    }),
  });

export const uploadChunkTool = (env: Env) =>
  createPrivateTool({
    id: "figma_upload_chunk",
    description:
      "Internal (used by the import UI): stores one base64 chunk of a canvas.fig upload.",
    inputSchema: z.object({
      id,
      index: z
        .number()
        .int()
        .min(0)
        .max(MAX_PARTS - 1),
      data: z.string().describe("base64"),
    }),
    annotations: { openWorldHint: false },
    execute: async ({ context }) => {
      const bytes = Buffer.from(context.data, "base64");
      if (bytes.length > CHUNK_BYTES)
        throw new Error(`chunk larger than ${CHUNK_BYTES} bytes`);
      await putBytes(env, keys(checkId(context.id)).part(context.index), bytes);
      return { ok: true, size: bytes.length };
    },
  });

export const registerTool = (env: Env) =>
  createPrivateTool({
    id: "figma_register",
    description:
      "Internal (used by the import UI): assembles uploaded chunks, validates and parses the document, and saves it.",
    inputSchema: z.object({
      id,
      name: z.string().min(1).max(200),
      parts: z.number().int().min(1).max(MAX_PARTS),
    }),
    annotations: { openWorldHint: false },
    execute: async ({ context: { id: fileId, name, parts } }) => {
      const k = keys(checkId(fileId));
      const partKeys = Array.from({ length: parts }, (_, i) => k.part(i));
      const chunks = await Promise.all(
        partKeys.map((key) => getBytes(env, key)),
      );
      const canvas = new Uint8Array(Buffer.concat(chunks));
      const sha = createHash("sha256").update(canvas).digest("hex");
      if (!sha.startsWith(fileId))
        throw new Error("upload corrupted (checksum mismatch), try again");
      const doc = parseCanvas(canvas); // throws on anything that isn't a valid document
      await putBytes(env, k.canvas, canvas);
      const info = infoOf(fileId, name, doc);
      await writeInfo(env, info);
      await cacheDoc(env, fileId, doc);
      await deleteKeys(env, partKeys);
      return info;
    },
  });
