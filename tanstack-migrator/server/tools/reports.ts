/** Presigned GET URLs for a run's parity artifacts (report + heatmaps). */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { HEATMAP_SLOTS } from "../lib/artifacts.ts";
import { getRun } from "../db/runs.ts";
import type { Env } from "../types/env.ts";

interface ObjectStorageBinding {
  GET_PRESIGNED_URL: (input: {
    key: string;
    expiresIn?: number;
  }) => Promise<{ url: string }>;
}

function getObjectStorage(env: Env): ObjectStorageBinding {
  const storage = env.MESH_REQUEST_CONTEXT?.state?.OBJECT_STORAGE;
  if (!storage) {
    throw new Error(
      "OBJECT_STORAGE binding is not configured — connect an object-storage MCP to view reports.",
    );
  }
  return storage as unknown as ObjectStorageBinding;
}

export const createParityReportUrlsTool = (env: Env) =>
  createTool({
    id: "PARITY_REPORT_URLS",
    description:
      "Presigned URLs for a parity run's artifacts: full HTML report, report.json and heatmap PNGs.",
    inputSchema: z.object({ runId: z.string() }),
    outputSchema: z.object({
      reportHtml: z.string().nullable(),
      reportJson: z.string().nullable(),
      heatmaps: z.array(z.object({ name: z.string(), url: z.string() })),
    }),
    annotations: { readOnlyHint: true },
    execute: async ({ context }) => {
      const run = await getRun(context.runId);
      if (!run) throw new Error("Run not found");
      if (!run.artifact_prefix) {
        return { reportHtml: null, reportJson: null, heatmaps: [] };
      }

      const storage = getObjectStorage(env);
      const presign = async (key: string) => {
        try {
          const { url } = await storage.GET_PRESIGNED_URL({
            key,
            expiresIn: 3600,
          });
          return url;
        } catch {
          return null;
        }
      };

      const prefix = run.artifact_prefix;
      const [reportHtml, reportJson, ...heatmaps] = await Promise.all([
        presign(`${prefix}/report.html`),
        presign(`${prefix}/report.json`),
        ...Array.from({ length: HEATMAP_SLOTS }, (_, i) =>
          presign(`${prefix}/heatmap_${i}.png`),
        ),
      ]);

      return {
        reportHtml,
        reportJson,
        heatmaps: heatmaps
          .map((url, i) => ({ name: `heatmap_${i}.png`, url: url ?? "" }))
          .filter((h) => h.url),
      };
    },
  });
