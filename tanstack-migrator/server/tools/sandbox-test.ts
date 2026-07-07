/**
 * Sandbox test/debug tools — exercise the sandbox as CODE, bypassing the
 * issue-driven pipeline (migrate → triage → fix → parity). Built to iterate on
 * sandbox/preview problems in ~2-3 min instead of a full ~30-min pipeline run.
 *
 * - SANDBOX_TEST     recreate (or reuse) a site's sandbox and probe the preview
 * - SANDBOX_EXEC     run one command/prompt inside the sandbox, return output
 * - SITE_SET_STATUS  force a site to any pipeline status (skip stages)
 *
 * All are tenant-scoped (site.connection_id must match the caller's connection).
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadAllConnections } from "../db/connections.ts";
import { addEvent } from "../db/events.ts";
import { getSite, updateSite } from "../db/sites.ts";
import type { SiteStatus } from "../db/types.ts";
import { buildWorkerCtx, type WorkerCtx } from "../lib/mesh.ts";
import { looksLikeRealSite } from "../lib/preview.ts";
import { getDriver } from "../sandbox/client.ts";
import type { SiteRow } from "../db/types.ts";
import type { Env } from "../types/env.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SITE_STATUSES = [
  "queued",
  "creating_repo",
  "provisioning_sandbox",
  "migrating_script",
  "opening_pr",
  "reviewing",
  "merging",
  "triaging",
  "fixing",
  "paritying",
  "deploying",
  "awaiting_merge",
  "done",
  "needs_human",
  "failed",
] as const;

/** Resolve the caller's connection → WorkerCtx + the tenant-checked site. */
async function resolveSite(
  env: Env,
  siteId: string,
  connectionId?: string,
): Promise<{ ctx: WorkerCtx; site: SiteRow }> {
  const rows = await loadAllConnections();
  if (rows.length === 0) throw new Error("no connection snapshot in DB");
  const wanted = connectionId ?? env.MESH_REQUEST_CONTEXT?.connectionId;
  const row = wanted
    ? rows.find((r) => r.connection_id === wanted)
    : rows.length === 1
      ? rows[0]
      : undefined;
  if (!row) {
    throw new Error(
      `connection not found (${wanted ?? "no context"}) — pass connectionId. Available: ${rows.map((r) => r.connection_id).join(", ")}`,
    );
  }
  const site = await getSite(siteId);
  if (!site || site.connection_id !== row.connection_id) {
    throw new Error(`site ${siteId} not found in this connection`);
  }
  return { ctx: buildWorkerCtx(row), site };
}

/** Live probe of a preview URL: status, size, whether it renders real HTML. */
async function probePreview(url: string): Promise<{
  httpStatus: number;
  sizeBytes: number;
  rendersRealHtml: boolean;
  isPlaceholder: boolean;
  snippet: string;
}> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    const html = await res.text();
    const isPlaceholder = /No web page|No dev server/i.test(html);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      httpStatus: res.status,
      sizeBytes: html.length,
      rendersRealHtml: !isPlaceholder && looksLikeRealSite(html),
      isPlaceholder,
      snippet: text.slice(0, 240),
    };
  } catch (err) {
    return {
      httpStatus: 0,
      sizeBytes: 0,
      rendersRealHtml: false,
      isPlaceholder: false,
      snippet: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export const createSandboxTestTool = (env: Env) =>
  createPrivateTool({
    id: "SANDBOX_TEST",
    description:
      "[test] Recreate (or reuse) a site's sandbox and probe its preview — no pipeline. " +
      "Fast loop for debugging the sandbox/dev-server/preview: provisions a fresh VM from the " +
      "current work branch, then polls the preview URL until it renders real HTML (or times out).",
    inputSchema: z.object({
      siteId: z.string().describe("Site row id to test"),
      recreate: z
        .boolean()
        .default(true)
        .describe("Destroy the existing sandbox first, forcing a fresh clone"),
      waitSeconds: z
        .number()
        .min(0)
        .max(300)
        .default(180)
        .describe(
          "How long to poll the preview for real HTML (0 = don't wait)",
        ),
      connectionId: z.string().optional(),
    }),
    outputSchema: z.object({
      handle: z.string().nullable(),
      previewUrl: z.string().nullable(),
      rendersRealHtml: z.boolean(),
      httpStatus: z.number(),
      sizeBytes: z.number(),
      isPlaceholder: z.boolean(),
      snippet: z.string(),
      waitedSeconds: z.number(),
    }),
    execute: async ({ context }) => {
      const { ctx, site } = await resolveSite(
        env,
        context.siteId,
        context.connectionId,
      );
      const driver = getDriver(ctx);

      if (context.recreate) {
        try {
          await driver.destroy(site, ctx);
        } catch {
          /* already reaped / not present */
        }
      }
      const info = await driver.ensure(site, ctx);
      await updateSite(site.id, {
        sandbox_handle: info.handle,
        sandbox_preview_url: info.previewUrl ?? site.sandbox_preview_url,
        preview_ready: false,
      });
      await addEvent(
        site.id,
        `[SANDBOX_TEST] sandbox ${context.recreate ? "recreated" : "ensured"}: ${info.handle}`,
      );

      const previewUrl = info.previewUrl ?? site.sandbox_preview_url ?? null;
      let probe = {
        httpStatus: 0,
        sizeBytes: 0,
        rendersRealHtml: false,
        isPlaceholder: false,
        snippet: "no preview URL",
      };
      const started = Date.now();
      if (previewUrl && context.waitSeconds >= 0) {
        do {
          probe = await probePreview(previewUrl);
          if (probe.rendersRealHtml) break;
          if ((Date.now() - started) / 1000 >= context.waitSeconds) break;
          await sleep(6_000);
        } while (true);
      }
      const waitedSeconds = Math.round((Date.now() - started) / 1000);
      if (probe.rendersRealHtml) {
        await updateSite(site.id, { preview_ready: true });
        await addEvent(
          site.id,
          `[SANDBOX_TEST] preview rendering real HTML: ${previewUrl}`,
        );
      }
      return { handle: info.handle, previewUrl, waitedSeconds, ...probe };
    },
  });

export const createSandboxExecTool = (env: Env) =>
  createPrivateTool({
    id: "SANDBOX_EXEC",
    description:
      "[test] Run ONE shell command/instruction inside a site's sandbox via a short agent session " +
      "and return the output tail. Use for debugging the dev server (e.g. 'tail -80 /tmp/dev.log', " +
      "'curl -s localhost:5173/ | head -c 400', 'ls src/server/cms'). Does not touch the pipeline.",
    inputSchema: z.object({
      siteId: z.string(),
      command: z
        .string()
        .describe(
          "What to run/inspect in the sandbox (a shell command or a short instruction)",
        ),
      timeoutMs: z.number().default(120_000),
      connectionId: z.string().optional(),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      output: z.string(),
      threadId: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { ctx, site } = await resolveSite(
        env,
        context.siteId,
        context.connectionId,
      );
      const prompt = `You are a DIAGNOSTIC agent in the sandbox (vm tools: bash, read). Do NOT modify anything, do NOT commit. Just run what was asked and report the RAW output.

# Command/instruction
${context.command}

# Result
Run it and paste the relevant output (truncated if huge). End your LAST message with exactly:
RESULT_JSON: {"ok": true, "detail": "<short summary of what the output shows>"}`;
      const result = await getDriver(ctx).runTask(site, ctx, {
        kind: "triage",
        prompt,
        timeoutMs: context.timeoutMs,
      });
      return {
        ok: result.ok,
        output: result.output,
        threadId: result.threadId,
        error: result.error,
      };
    },
  });

export const createSiteSetStatusTool = (env: Env) =>
  createPrivateTool({
    id: "SITE_SET_STATUS",
    description:
      "[test] Force a site to a specific pipeline status, skipping stages. " +
      "The worker picks it up on the next tick. Clears the live-session markers by default " +
      "so the target phase starts clean. Use to jump straight to a phase you want to test.",
    inputSchema: z.object({
      siteId: z.string(),
      status: z.enum(SITE_STATUSES).describe("Target pipeline status"),
      clearSession: z
        .boolean()
        .default(true)
        .describe("Clear session/lease/thread markers + error"),
      connectionId: z.string().optional(),
    }),
    outputSchema: z.object({ id: z.string(), status: z.string() }),
    execute: async ({ context }) => {
      const { site } = await resolveSite(
        env,
        context.siteId,
        context.connectionId,
      );
      const patch: Record<string, unknown> = {
        status: context.status as SiteStatus,
        phase_detail: `[SITE_SET_STATUS] forced to ${context.status}`,
        last_progress_at: new Date().toISOString(),
      };
      if (context.clearSession) {
        Object.assign(patch, {
          error: null,
          resume_status: null,
          sandbox_session_id: null,
          phase_thread_id: null,
          lease_owner: null,
          lease_expires_at: null,
          transient_retries: 0,
        });
      }
      const updated = await updateSite(site.id, patch);
      await addEvent(
        site.id,
        `[SITE_SET_STATUS] status forced → ${context.status}`,
        "warn",
      );
      return { id: updated.id, status: updated.status };
    },
  });
