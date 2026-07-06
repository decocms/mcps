/** Site registration + queue control tools (called by the dashboard UI and by agents). */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { loadConnection, saveConnection } from "../db/connections.ts";
import { ensureApiKeyFromRequest } from "../lib/ensure-api-key.ts";
import { addEvent } from "../db/events.ts";
import { listEventsForSite } from "../db/events.ts";
import { listRunsForSite } from "../db/runs.ts";
import {
  deleteSite,
  getSite,
  insertSite,
  listSites,
  reorderSites,
  updateSite,
} from "../db/sites.ts";
import {
  isActiveStatus,
  RESUMABLE_STATUSES,
  type SiteStatus,
  toCurrentStatus,
} from "../db/types.ts";
import { buildWorkerCtx } from "../lib/mesh.ts";
import { fetchThreadTranscript } from "../sandbox/drivers/decopilot.ts";
import type { Env } from "../types/env.ts";
import {
  EventViewSchema,
  RunViewSchema,
  SiteViewSchema,
  toEventView,
  toRunView,
  toSiteView,
} from "./views.ts";

function requireConnectionId(env: Env): string {
  const connectionId = env.MESH_REQUEST_CONTEXT?.connectionId;
  if (!connectionId) {
    throw new Error(
      "Sem contexto de conexão do mesh (connectionId ausente). Chame este MCP através de uma conexão do studio — e se a conexão foi criada com um access token preenchido, limpe o campo Token e salve.",
    );
  }
  return connectionId;
}

/** Make sure the connection row exists before writing sites that reference it. */
async function ensureConnectionRow(env: Env): Promise<string> {
  const connectionId = requireConnectionId(env);
  const existing = await loadConnection(connectionId).catch(() => null);
  if (!existing) {
    await saveConnection({
      connectionId,
      organizationId: env.MESH_REQUEST_CONTEXT?.organizationId ?? "unknown",
      meshUrl: env.MESH_REQUEST_CONTEXT?.meshUrl ?? "https://api.decocms.com",
      meshToken: env.MESH_REQUEST_CONTEXT?.token,
    });
  }
  void ensureApiKeyFromRequest(env); // fire-and-forget, throttled
  return connectionId;
}

function normalizeRepo(input: string, org: string): string {
  const trimmed = input
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
  return trimmed.includes("/") ? trimmed : `${org}/${trimmed}`;
}

export const createSiteRegisterTool = (env: Env) =>
  createTool({
    id: "SITE_REGISTER",
    description:
      "Register a site in the migration queue (Fresh/Deno → TanStack Start). The queue starts migrations automatically, FIFO.",
    inputSchema: z.object({
      sourceRepo: z
        .string()
        .describe(
          'Source repo, e.g. "deco-sites/granadobr" or just "granadobr"',
        ),
      prodUrl: z
        .string()
        .describe(
          "Production URL of the live (Fresh) site, e.g. https://www.granado.com.br",
        ),
      name: z
        .string()
        .optional()
        .describe("Display name (defaults to the repo name)"),
      sourceBranch: z.string().optional(),
      parityTarget: z.number().min(50).max(100).optional(),
      maxIterations: z.number().int().min(1).max(30).optional(),
      alreadyDone: z
        .boolean()
        .optional()
        .describe(
          "Register a migration that is already finished (shows up in the done list)",
        ),
      startNow: z
        .boolean()
        .optional()
        .describe(
          "Start the migration immediately (queued). Default: false — adds to backlog as draft.",
        ),
      targetRepo: z
        .string()
        .optional()
        .describe("Override the -tanstack repo (for alreadyDone sites)"),
    }),
    outputSchema: z.object({
      siteId: z.string(),
      position: z.number().describe("Position in the queue (0 = done/active)"),
    }),
    execute: async ({ context }) => {
      const connectionId = await ensureConnectionRow(env);
      const org =
        (env.MESH_REQUEST_CONTEXT?.state as { GITHUB_ORG?: string } | undefined)
          ?.GITHUB_ORG ?? "deco-sites";
      const sourceRepo = normalizeRepo(context.sourceRepo, org);
      const prodUrl = context.prodUrl.replace(/\/$/, "");
      if (!/^https?:\/\//.test(prodUrl)) {
        throw new Error("prodUrl must be an absolute http(s) URL");
      }

      const status = context.alreadyDone
        ? "done"
        : context.startNow
          ? "queued"
          : "draft";

      const site = await insertSite({
        connectionId,
        name: context.name ?? sourceRepo.split("/")[1],
        sourceRepo,
        sourceBranch: context.sourceBranch,
        prodUrl,
        parityTarget: context.parityTarget,
        maxIterations: context.maxIterations,
        status,
        targetRepo:
          context.targetRepo ??
          (context.alreadyDone ? `${sourceRepo}-tanstack` : undefined),
      });
      await addEvent(
        site.id,
        context.alreadyDone
          ? "Cadastrado como migração já concluída"
          : status === "queued"
            ? "Site cadastrado e enfileirado para migração"
            : "Site cadastrado no backlog (draft)",
      );

      const position = site.queue_position ?? 0;
      return { siteId: site.id, position };
    },
  });

export const createSiteListTool = (env: Env) =>
  createTool({
    id: "SITE_LIST",
    description: "List registered sites with status and parity score.",
    inputSchema: z.object({
      status: z.string().optional().describe("Filter by status"),
    }),
    outputSchema: z.object({ sites: z.array(SiteViewSchema) }),
    annotations: { readOnlyHint: true },
    execute: async ({ context }) => {
      const connectionId = requireConnectionId(env);
      const sites = await listSites({
        connectionId,
        statuses: context.status ? [context.status as SiteStatus] : undefined,
      });
      return { sites: sites.map(toSiteView) };
    },
  });

export const createSiteGetTool = (env: Env) =>
  createTool({
    id: "SITE_GET",
    description:
      "Full detail of a migration: site, runs (with parity summaries) and activity feed.",
    inputSchema: z.object({ siteId: z.string() }),
    outputSchema: z.object({
      site: SiteViewSchema,
      runs: z.array(RunViewSchema),
      events: z.array(EventViewSchema),
    }),
    annotations: { readOnlyHint: true },
    execute: async ({ context }) => {
      requireConnectionId(env);
      const site = await getSite(context.siteId);
      if (!site) throw new Error("Site not found");
      const [runs, events] = await Promise.all([
        listRunsForSite(site.id),
        listEventsForSite(site.id),
      ]);
      return {
        site: toSiteView(site),
        runs: runs.map(toRunView),
        events: events.map(toEventView),
      };
    },
  });

const TerminalEntrySchema = z.object({
  seq: z.number(),
  role: z.string(),
  kind: z.enum(["text", "command", "tool", "reasoning"]),
  text: z.string().optional(),
  command: z.string().optional(),
  exitCode: z.number().optional(),
  output: z.string().optional(),
  tool: z.string().optional(),
});

/**
 * Live terminal for the drawer — replays the current migration session's thread
 * as a command/narration transcript (like the agentic CMS terminal). Prefers
 * the live phase thread; falls back to the latest run's thread when idle so the
 * panel shows the last session instead of going blank. Read-only, meant to be
 * polled every few seconds while a run is active.
 */
export const createSiteTerminalTool = (env: Env) =>
  createTool({
    id: "SITE_TERMINAL",
    description:
      "Live terminal transcript of a site's current migration session: the agent's narration + every bash command it ran (with exit code and output snippet). Powers the drawer's Terminal tab. Read-only — poll it.",
    inputSchema: z.object({ siteId: z.string() }),
    outputSchema: z.object({
      threadId: z.string().nullable(),
      /** true when this is the still-running phase thread (not a past run). */
      live: z.boolean(),
      entries: z.array(TerminalEntrySchema),
      updatedAt: z.string(),
    }),
    annotations: { readOnlyHint: true },
    execute: async ({ context }) => {
      const connectionId = requireConnectionId(env);
      const now = new Date().toISOString();
      const site = await getSite(context.siteId);
      // tenant isolation: this tool loads the site's worker credentials and
      // fetches its thread — never let a foreign siteId reach another org's
      // transcript. "not found" (not "forbidden") avoids leaking existence.
      if (!site || site.connection_id !== connectionId) {
        throw new Error("Site not found");
      }

      // live phase thread first; fall back to the newest run that has a thread
      let threadId = site.phase_thread_id ?? null;
      const live = Boolean(site.phase_thread_id);
      if (!threadId) {
        const runs = await listRunsForSite(site.id);
        threadId = runs.find((r) => r.meta?.threadId)?.meta?.threadId ?? null;
      }
      if (!threadId) {
        return { threadId: null, live: false, entries: [], updatedAt: now };
      }

      const row = await loadConnection(site.connection_id);
      if (!row) return { threadId, live, entries: [], updatedAt: now };
      try {
        const entries = await fetchThreadTranscript(
          buildWorkerCtx(row),
          threadId,
          150,
        );
        return { threadId, live, entries, updatedAt: now };
      } catch {
        // thread not readable yet (just dispatched) — empty is fine, keep polling
        return { threadId, live, entries: [], updatedAt: now };
      }
    },
  });

const siteIdInput = z.object({ siteId: z.string() });
const siteOutput = z.object({ site: SiteViewSchema });

export const createSitePauseTool = (env: Env) =>
  createTool({
    id: "SITE_PAUSE",
    description:
      "Pause a queued/active migration (keeps its place; resume later).",
    inputSchema: siteIdInput,
    outputSchema: siteOutput,
    execute: async ({ context }) => {
      requireConnectionId(env);
      const site = await getSite(context.siteId);
      if (!site) throw new Error("Site not found");
      if (site.status !== "queued" && !isActiveStatus(site.status)) {
        throw new Error(`Cannot pause a site in status ${site.status}`);
      }
      const updated = await updateSite(site.id, {
        status: "paused",
        resume_status: site.status === "queued" ? "queued" : site.status,
        sandbox_session_id: null,
      });
      await addEvent(site.id, "Migração pausada");
      return { site: toSiteView(updated) };
    },
  });

export const createSiteResumeTool = (env: Env) =>
  createTool({
    id: "SITE_RESUME",
    description: "Resume a paused migration from where it stopped.",
    inputSchema: siteIdInput,
    outputSchema: siteOutput,
    execute: async ({ context }) => {
      requireConnectionId(env);
      const site = await getSite(context.siteId);
      if (!site) throw new Error("Site not found");
      if (site.status !== "paused") {
        throw new Error(`Site is not paused (status: ${site.status})`);
      }
      const updated = await updateSite(site.id, {
        status: toCurrentStatus((site.resume_status ?? "queued") as SiteStatus),
        resume_status: null,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(site.id, "Migração retomada");
      return { site: toSiteView(updated) };
    },
  });

export const createSiteRetryTool = (env: Env) =>
  createTool({
    id: "SITE_RETRY",
    description:
      "Retry a failed/needs_human migration from the phase where it stopped (clears the error and stall counters).",
    inputSchema: z.object({
      siteId: z.string(),
      fromStatus: z
        .string()
        .optional()
        .describe(
          "Override the phase to resume into (e.g. triaging, fixing, deploying)",
        ),
    }),
    outputSchema: siteOutput,
    execute: async ({ context }) => {
      requireConnectionId(env);
      const site = await getSite(context.siteId);
      if (!site) throw new Error("Site not found");
      if (!RESUMABLE_STATUSES.includes(site.status)) {
        throw new Error(`Site is not retryable (status: ${site.status})`);
      }
      const nextStatus = toCurrentStatus(
        (context.fromStatus ?? site.resume_status ?? "queued") as SiteStatus,
      );
      const updated = await updateSite(site.id, {
        status: nextStatus,
        resume_status: null,
        error: null,
        needs_human_reason: null,
        no_improve_count: 0,
        sandbox_session_id: null,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(site.id, `Retry: retomando em ${nextStatus}`);
      return { site: toSiteView(updated) };
    },
  });

export const createSiteMarkDoneTool = (env: Env) =>
  createTool({
    id: "SITE_MARK_DONE",
    description: "Manually mark a migration as done (100% TanStack).",
    inputSchema: z.object({
      siteId: z.string(),
      reason: z.string().optional(),
    }),
    outputSchema: siteOutput,
    execute: async ({ context }) => {
      requireConnectionId(env);
      const site = await getSite(context.siteId);
      if (!site) throw new Error("Site not found");
      const updated = await updateSite(site.id, {
        status: "done",
        finished_at: new Date().toISOString(),
        needs_human_reason: null,
        error: null,
      });
      await addEvent(
        site.id,
        `Marcado como concluído manualmente${context.reason ? `: ${context.reason}` : ""}`,
      );
      return { site: toSiteView(updated) };
    },
  });

export const createSiteArchiveTool = (env: Env) =>
  createTool({
    id: "SITE_ARCHIVE",
    description: "Archive a site (hides it from the dashboard).",
    inputSchema: z.object({ siteId: z.string() }),
    outputSchema: siteOutput,
    execute: async ({ context }) => {
      requireConnectionId(env);
      const site = await getSite(context.siteId);
      if (!site) throw new Error("Site not found");
      if (isActiveStatus(site.status)) {
        throw new Error("Pause the migration before archiving");
      }
      const updated = await updateSite(site.id, { status: "archived" });
      await addEvent(site.id, "Site arquivado");
      return { site: toSiteView(updated) };
    },
  });

export const createSiteDeleteTool = (env: Env) =>
  createTool({
    id: "SITE_DELETE",
    description:
      "Permanently delete a site and its runs/events. Frees the repo to be registered again. Does NOT touch GitHub/CF/sandbox resources.",
    inputSchema: z.object({ siteId: z.string() }),
    outputSchema: z.object({ deleted: z.boolean() }),
    execute: async ({ context }) => {
      requireConnectionId(env);
      const site = await getSite(context.siteId);
      if (!site) return { deleted: false };
      if (isActiveStatus(site.status)) {
        throw new Error("Pause the migration before deleting");
      }
      await deleteSite(site.id);
      return { deleted: true };
    },
  });

export const createSiteEnqueueTool = (env: Env) =>
  createTool({
    id: "SITE_ENQUEUE",
    description:
      "Move a draft site to the migration queue (queued). The site keeps its queue_position so it runs in the planned order.",
    inputSchema: z.object({ siteId: z.string() }),
    outputSchema: siteOutput,
    execute: async ({ context }) => {
      requireConnectionId(env);
      const site = await getSite(context.siteId);
      if (!site) throw new Error("Site not found");
      if (site.status !== "draft") {
        throw new Error(
          `Site is not a draft (status: ${site.status}) — only drafts can be enqueued`,
        );
      }
      const updated = await updateSite(site.id, {
        status: "queued",
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(site.id, "Site movido do backlog para a fila de migração");
      return { site: toSiteView(updated) };
    },
  });

export const createSiteReorderTool = (env: Env) =>
  createTool({
    id: "SITE_REORDER",
    description:
      "Set the priority order of backlog/queued sites. Pass the site IDs in the desired order — position 1 migrates first.",
    inputSchema: z.object({
      orderedIds: z
        .array(z.string())
        .min(1)
        .describe("Site IDs in priority order (first = next to migrate)"),
    }),
    outputSchema: z.object({ ok: z.boolean() }),
    execute: async ({ context }) => {
      const connectionId = requireConnectionId(env);
      await reorderSites(connectionId, context.orderedIds);
      return { ok: true };
    },
  });
