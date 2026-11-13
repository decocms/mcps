import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadPiece, type Piece, productIdFromLink } from "../lib/catalog.ts";
import {
  composeVersion,
  loadPlate,
  type PieceSource,
  removeVersion,
  runEdit,
  type Version,
} from "../lib/edit.ts";
import { checkStill, encodeStill } from "../lib/image.ts";
import { readJob, startJob } from "../lib/jobs.ts";
import { type Publication, publishStill } from "../lib/publish.ts";
import { type Storage, storage } from "../lib/storage.ts";
import { type Env, settings } from "../types/env.ts";

export const STILL_EDITOR_RESOURCE_URI = "ui://still-editor/editor";

const newId = () =>
  `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;

function currentUser(env: Env) {
  const user = env.MESH_REQUEST_CONTEXT.ensureAuthenticated();
  if (!user) throw new Error("Sign in to Studio to use the Still editor");
  return user;
}

async function readAll<T extends { id: string }>(
  store: Storage,
  folder: string,
): Promise<T[]> {
  const paths = (await store.list(folder)).filter((path) =>
    path.endsWith(".json"),
  );
  const items: Array<T | null> = await Promise.all(
    paths.map((path) => store.getJson<T>(path)),
  );
  return items.filter((item): item is T => item !== null);
}

async function versionWithUrl(store: Storage, version: Version) {
  const [imageUrl, beforeUrl] = await Promise.all([
    store.getUrl(`pieces/${version.productId}/versions/${version.id}.jpg`),
    version.beforePath ? store.getUrl(version.beforePath) : null,
  ]);
  return { ...version, imageUrl, beforeUrl };
}

function pieceSummary(piece: Piece) {
  return {
    productId: piece.productId,
    name: piece.name,
    alias: piece.alias,
    type: piece.type,
    variantCount: piece.variantIds.length,
    still: piece.still
      ? { imageId: piece.still.id, url: piece.still.url }
      : null,
  };
}

const linkSchema = z
  .string()
  .min(1)
  .describe("Storefront link of the product (…-<productId>) or its id");

export const stillEditorTool = (_env: Env) =>
  createPrivateTool({
    id: "still_editor",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    description:
      "Open the Still editor: paste a product link, edit its Still (the garment photo on the brand's backdrop used by Mix & Match) with an image model, and publish the approved version to the store.",
    inputSchema: z.object({
      link: linkSchema.optional(),
      _route: z.string().optional(),
    }),
    outputSchema: z.object({ link: z.string().nullable() }),
    _meta: { ui: { resourceUri: STILL_EDITOR_RESOURCE_URI } },
    execute: async ({ context }) => ({ link: context.link ?? null }),
  });

export const stillLoadTool = (_env: Env) =>
  createPrivateTool({
    id: "still_load",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    description:
      "Load a product for editing: its current Still, the pair garment, the edit versions and the publication history.",
    inputSchema: z.object({
      link: linkSchema,
      pairLink: linkSchema
        .optional()
        .describe("Another garment to preview the outfit with"),
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      currentUser(env);
      const productId = productIdFromLink(context.link);
      if (!productId) {
        throw new Error(
          "This link has no product id. Paste a product page link.",
        );
      }
      const store = storage(env);
      const piece = await loadPiece(env, productId);
      const source = await store.getJson<PieceSource>(
        `pieces/${productId}/source.json`,
      );
      const pairId = context.pairLink
        ? productIdFromLink(context.pairLink)
        : (source?.pairProductId ?? null);
      const pair = pairId
        ? await loadPiece(env, pairId).catch(() => null)
        : null;
      const [versions, publications] = await Promise.all([
        readAll<Version>(store, `pieces/${productId}/versions/`),
        readAll<Publication>(store, `pieces/${productId}/publications/`),
      ]);
      const { MODELS, DEFAULT_MODEL } = settings(env);
      return {
        piece: pieceSummary(piece),
        pair: pair ? pieceSummary(pair) : null,
        hasSource: source !== null,
        versions: await Promise.all(
          versions
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((version) => versionWithUrl(store, version)),
        ),
        publications: publications.sort((a, b) => b.at.localeCompare(a.at)),
        models: MODELS,
        defaultModel: DEFAULT_MODEL,
      };
    },
  });

export const stillEditStartTool = (_env: Env) =>
  createPrivateTool({
    id: "still_edit_start",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    description:
      "Start an edit of a product's Still from the original or from a previous version. Returns a job to poll with still_edit_status (an edit takes up to a few minutes).",
    inputSchema: z.object({
      productId: z.number().int().positive(),
      parentId: z
        .string()
        .nullable()
        .default(null)
        .describe("Version to edit; null edits the original"),
      request: z
        .string()
        .min(3)
        .max(2000)
        .describe("What to change, in the user's words"),
      model: z.string().optional(),
    }),
    outputSchema: z.object({ jobId: z.string(), versionId: z.string() }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const user = currentUser(env);
      const { MODELS, DEFAULT_MODEL } = settings(env);
      const model = context.model ?? DEFAULT_MODEL;
      if (!MODELS.includes(model)) {
        throw new Error(`Model ${model} is not enabled for this editor`);
      }
      const store = storage(env);
      const piece = await loadPiece(env, context.productId);
      const versionId = newId();
      const job = await startJob(
        store,
        { id: newId(), productId: piece.productId, versionId },
        (onPhase) =>
          runEdit({
            env,
            store,
            piece,
            versionId,
            parentId: context.parentId,
            request: context.request,
            model,
            user,
            onPhase,
          }),
      );
      return { jobId: job.id, versionId };
    },
  });

export const stillEditStatusTool = (_env: Env) =>
  createPrivateTool({
    id: "still_edit_status",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    description: "Status of an edit started with still_edit_start.",
    inputSchema: z.object({ jobId: z.string() }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      currentUser(env);
      const store = storage(env);
      const job = await readJob(store, context.jobId);
      const version =
        job.status === "done"
          ? await store.getJson<Version>(
              `pieces/${job.productId}/versions/${job.versionId}.json`,
            )
          : null;
      return {
        status: job.status,
        phase: job.phase ?? null,
        startedAt: job.startedAt,
        error: job.error ?? null,
        version: version ? await versionWithUrl(store, version) : null,
      };
    },
  });

const expectedStillSchema = z
  .number()
  .int()
  .nullable()
  .describe("The Still image id seen when the product was opened");

export const stillPublishTool = (_env: Env) =>
  createPrivateTool({
    id: "still_publish",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    description:
      "Publish an approved version as the product's Still on every variant in the store. Changes the live store; the replaced Still is kept and can be restored.",
    inputSchema: z.object({
      productId: z.number().int().positive(),
      versionId: z.string(),
      sizeFactor: z.number().min(0.8).max(1.2).default(1),
      expectedStillId: expectedStillSchema,
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const user = currentUser(env);
      const store = storage(env);
      const piece = await loadPiece(env, context.productId);
      const base = `pieces/${piece.productId}/versions`;
      const version = await store.getJson<Version>(
        `${base}/${context.versionId}.json`,
      );
      if (!version) throw new Error(`Version ${context.versionId} not found`);
      let imagePath = `${base}/${version.id}.jpg`;
      if (context.sizeFactor !== 1) {
        const still = await composeVersion(
          store,
          await loadPlate(store),
          version,
          context.sizeFactor,
        );
        const check = checkStill(still);
        if (!check.ok) {
          throw new Error(
            `At this size the Still is outside the standard: ${check.problems.join("; ")}`,
          );
        }
        imagePath = `${base}/${version.id}-x${context.sizeFactor.toFixed(2)}.jpg`;
        await store.put(imagePath, await encodeStill(still), "image/jpeg");
      } else if (!version.check.ok) {
        throw new Error(
          `This version is outside the Still standard: ${version.check.problems.join("; ")}`,
        );
      }
      return publishStill({
        env,
        store,
        piece,
        imagePath,
        expectedStillId: context.expectedStillId,
        publicationId: newId(),
        kind: "publish",
        from: version.id,
        sizeFactor: context.sizeFactor,
        user,
      });
    },
  });

export const stillRestoreTool = (_env: Env) =>
  createPrivateTool({
    id: "still_restore",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    description:
      "Put back the Still that a publication replaced, on every variant. Changes the live store.",
    inputSchema: z.object({
      productId: z.number().int().positive(),
      publicationId: z.string(),
      expectedStillId: expectedStillSchema,
    }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      const user = currentUser(env);
      const store = storage(env);
      const publication = await store.getJson<Publication>(
        `pieces/${context.productId}/publications/${context.publicationId}.json`,
      );
      if (!publication?.before) {
        throw new Error("This publication has no previous Still to restore");
      }
      return publishStill({
        env,
        store,
        piece: await loadPiece(env, context.productId),
        imagePath: publication.before.path,
        expectedStillId: context.expectedStillId,
        publicationId: newId(),
        kind: "restore",
        from: publication.id,
        sizeFactor: 1,
        user,
      });
    },
  });

export const stillVersionDeleteTool = (_env: Env) =>
  createPrivateTool({
    id: "still_version_delete",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Delete an edit version: its image, request and files. The store is not changed; publications keep their own backup.",
    inputSchema: z.object({
      productId: z.number().int().positive(),
      versionId: z.string().min(1),
    }),
    outputSchema: z.object({ deleted: z.boolean() }),
    execute: async ({ context, runtimeContext }) => {
      const env = runtimeContext.env as Env;
      currentUser(env);
      const store = storage(env);
      const found = await store.getJson<Version>(
        `pieces/${context.productId}/versions/${context.versionId}.json`,
      );
      if (!found) return { deleted: false };
      await removeVersion(store, context.productId, context.versionId);
      return { deleted: true };
    },
  });

export const stillTools = [
  stillEditorTool,
  stillLoadTool,
  stillEditStartTool,
  stillEditStatusTool,
  stillPublishTool,
  stillRestoreTool,
  stillVersionDeleteTool,
];
