/**
 * Decopilot driver — live mode via the same path the agentic CMS uses
 * (verified against mesh main @ 2026-07-03/04):
 *
 *   project:   COLLECTION_VIRTUAL_MCP_CREATE on {meshUrl}/mcp/self creates the
 *              virtual MCP bound to the repo (metadata.githubRepo {url, owner,
 *              name, connectionId?, installationId?}).
 *   lifecycle: SANDBOX_START / SANDBOX_DELETE management tools on /mcp/self
 *              ({virtualMcpId, branch, sandboxProviderKind: "agent-sandbox"}).
 *              Re-calling SANDBOX_START resets the idle TTL (keepalive).
 *   execution: thread-based decopilot runs (StreamRequestSchema in
 *              mesh apps/mesh/src/api/routes/decopilot/schemas.ts):
 *                POST {meshUrl}/api/{orgSlug}/decopilot/threads/{threadId}/messages
 *                  { messages: [one user UIMessage], agent: {id: virtualMcpId},
 *                    harnessId: "claude-code", sandboxProviderKind, branch, ... }
 *                → 202 {taskId}; then consume
 *                GET {meshUrl}/api/{orgSlug}/decopilot/threads/{threadId}/stream
 *              The harness/branch/kind are PINNED on the first message; the
 *              (user, branch) pair routes the run into the sandbox started by
 *              SANDBOX_START — which is why everything (sandbox, threads)
 *              runs on the site's work_branch.
 *
 * v0.5.0: threads are reused WITHIN a phase (multi-turn — a retry continues
 * the conversation with context instead of starting over), and each session
 * ends with a telemetry pass: MONITORING_THREAD_USAGE (cost/tokens) and the
 * thread's bash tool parts (command log) go into sitemig_runs.meta.
 */

import { collectFullStreamText } from "@decocms/mcps-shared/mesh-chat";
import { addEvent } from "../../db/events.ts";
import { attachThreadToRun } from "../../db/runs.ts";
import { updateSite } from "../../db/sites.ts";
import type { RunMeta, SiteRow } from "../../db/types.ts";
import {
  callSelfTool,
  resolveMeshUrl,
  type WorkerCtx,
} from "../../lib/mesh.ts";
import { bindingConnectionId } from "../../lib/persist-state.ts";
import { parseRepo } from "../../lib/github.ts";
import type {
  SandboxDriver,
  SandboxInfo,
  SandboxTaskInput,
  SandboxTaskResult,
} from "../client.ts";
import { parseResultJson } from "../templates/prompts.ts";

const DEFAULT_TASK_TIMEOUT_MS = 45 * 60_000;
/** Reconnect cadence for the thread SSE while the run is still going. */
const STREAM_RECONNECT_DELAY_MS = 3_000;

function workBranch(site: SiteRow): string {
  return site.work_branch || "main";
}

interface SandboxStartResult {
  previewUrl?: string | null;
  sandboxHandle?: string;
  branch?: string;
  isNewVm?: boolean;
  sandboxProviderKind?: string;
}

/** Create the mesh project (virtual MCP) bound to the -tanstack repo. */
async function createVirtualMcp(
  site: SiteRow,
  ctx: WorkerCtx,
): Promise<string> {
  if (!site.target_repo) {
    throw new Error(`Site ${site.name} has no target_repo yet`);
  }
  const { owner, repo } = parseRepo(site.target_repo);
  const githubConnectionId =
    bindingConnectionId(ctx.state, "GITHUB") ?? undefined;

  const result = await callSelfTool<{ item?: { id?: string } }>(
    ctx,
    "COLLECTION_VIRTUAL_MCP_CREATE",
    {
      data: {
        title: `${site.name} · tanstack migration`,
        description: `Managed by tanstack-migrator — ${site.source_repo} → ${site.target_repo}`,
        metadata: {
          githubRepo: {
            url: `https://github.com/${site.target_repo}`,
            owner,
            name: repo,
            ...(githubConnectionId ? { connectionId: githubConnectionId } : {}),
            ...(ctx.config.githubInstallationId
              ? { installationId: ctx.config.githubInstallationId }
              : {}),
          },
        },
        connections: [],
      },
    },
    60_000,
  );

  const id = result?.item?.id;
  if (!id) {
    throw new Error(
      `COLLECTION_VIRTUAL_MCP_CREATE returned no id: ${JSON.stringify(result).slice(0, 200)}`,
    );
  }
  return id;
}

async function sandboxStart(
  virtualMcpId: string,
  branch: string,
  ctx: WorkerCtx,
): Promise<SandboxStartResult> {
  // "auto" omits the kind: mesh picks user-desktop when the acting user's
  // link daemon is online (how the agentic CMS runs sandboxes locally),
  // else the env default. Production installs pin "agent-sandbox".
  const kind = ctx.config.sandboxKind;
  return await callSelfTool<SandboxStartResult>(
    ctx,
    "SANDBOX_START",
    {
      virtualMcpId,
      branch,
      ...(kind === "auto" ? {} : { sandboxProviderKind: kind }),
    },
    180_000,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function createThread(
  ctx: WorkerCtx,
  virtualMcpId: string,
  branch: string,
): Promise<string> {
  const threadId = `mig-${crypto.randomUUID()}`;
  // The canonical thread row must exist before the first message —
  // thread_message_parts has an FK to threads (500 otherwise).
  await callSelfTool(
    ctx,
    "COLLECTION_THREADS_CREATE",
    {
      data: {
        id: threadId,
        title: "tanstack-migrator session",
        virtual_mcp_id: virtualMcpId,
        branch,
      },
    },
    30_000,
  );
  return threadId;
}

async function dispatchMessage(
  ctx: WorkerCtx,
  threadId: string,
  virtualMcpId: string,
  branch: string,
  prompt: string,
): Promise<void> {
  const base = resolveMeshUrl(ctx.meshUrl);
  // decopilot routes are keyed by org SLUG (an org-id 404s: "organization not found")
  const org = ctx.organizationSlug ?? ctx.organizationId;
  const kind = ctx.config.sandboxKind;

  // Body per StreamRequestSchema (strict): exactly one non-system message,
  // agent.id = virtualMcpId, harness/branch/kind pinned on first message.
  const body = {
    messages: [
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: prompt }],
      },
    ],
    agent: { id: virtualMcpId },
    stream: true,
    branch,
    toolApprovalLevel: "auto" as const,
    // claude-code needs an Anthropic AI-provider key in the org; decopilot
    // rides the org's default LLM credentials (e.g. OpenRouter)
    harnessId: ctx.config.sessionHarness,
    ...(kind === "auto" ? {} : { sandboxProviderKind: kind }),
  };

  const post = await fetch(
    `${base}/api/${org}/decopilot/threads/${threadId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.meshToken}`,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!post.ok && post.status !== 202) {
    const errorText = await post.text();
    throw new Error(
      `decopilot message dispatch failed (${post.status}): ${errorText.slice(0, 300)}`,
    );
  }
}

/**
 * One bounded decopilot run. Reuses `existingThreadId` when given (multi-turn
 * within a phase — the harness keeps the conversation context); a dispatch
 * rejection on a reused thread falls back to a fresh one. Returns the full
 * output and the thread that actually ran.
 */
async function runDecopilotSession(
  ctx: WorkerCtx,
  site: SiteRow,
  virtualMcpId: string,
  prompt: string,
  timeoutMs: number,
  runId?: string,
  existingThreadId?: string,
): Promise<{ output: string; threadId: string }> {
  const base = resolveMeshUrl(ctx.meshUrl);
  const org = ctx.organizationSlug ?? ctx.organizationId;
  if (!ctx.meshToken) {
    throw new Error("No mesh token available for decopilot sessions");
  }
  const branch = workBranch(site);

  let threadId = existingThreadId ?? "";
  let reused = Boolean(existingThreadId);
  if (!threadId) {
    threadId = await createThread(ctx, virtualMcpId, branch);
  }
  try {
    await dispatchMessage(ctx, threadId, virtualMcpId, branch, prompt);
  } catch (err) {
    if (!reused) throw err;
    // reused thread rejected the message (e.g. run still marked active) —
    // continue on a fresh thread instead of dying
    const message = err instanceof Error ? err.message : String(err);
    await addEvent(
      site.id,
      `Thread ${threadId} recusou a mensagem (${message.slice(0, 120)}) — abrindo thread nova`,
      "warn",
    );
    reused = false;
    threadId = await createThread(ctx, virtualMcpId, branch);
    await dispatchMessage(ctx, threadId, virtualMcpId, branch, prompt);
  }

  await addEvent(
    site.id,
    `Sessão despachada (202) — thread ${threadId}${reused ? " (continuação)" : ""} · harness ${ctx.config.sessionHarness} · branch ${branch}`,
  );
  if (runId) await attachThreadToRun(runId, threadId).catch(() => {});
  await updateSite(site.id, {
    phase_thread_id: threadId,
    phase_detail: `sessão ${threadId} na fila do decopilot`,
    last_progress_at: new Date().toISOString(),
  }).catch(() => {});

  // Consume the thread stream until RESULT_JSON shows up or time runs out.
  const streamUrl = `${base}/api/${org}/decopilot/threads/${threadId}/stream`;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let output = "";
  let lastHeartbeat = 0;

  while (Date.now() < deadline) {
    const remaining = Math.max(10_000, deadline - Date.now());
    try {
      const response = await fetch(streamUrl, {
        headers: {
          Authorization: `Bearer ${ctx.meshToken}`,
          Accept: "text/event-stream",
        },
        signal: AbortSignal.timeout(remaining),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `decopilot thread stream failed (${response.status}): ${errorText.slice(0, 300)}`,
        );
      }
      if (response.body) {
        // Stream replays from the buffer on reconnect — safe to re-read.
        output = await collectFullStreamText(response.body);
        if (parseResultJson(output)) return { output, threadId };
      }

      // SSE gave no marker — the run may have already finished (v2 storage
      // persists the assistant message at completion; the stream buffer can
      // be empty by then). Check the thread status and rescue the final text
      // instead of spinning until the timeout.
      const status = await getThreadStatus(ctx, threadId);
      if (status && status !== "in_progress" && status !== "requires_action") {
        const finalText = await fetchThreadFinalText(ctx, threadId);
        if (finalText) output = `${output}\n${finalText}`.trim();
        await addEvent(
          site.id,
          `Thread ${threadId} terminou (status: ${status}) — ${parseResultJson(output) ? "RESULT_JSON capturado" : "SEM RESULT_JSON (sessão incompleta)"}`,
          parseResultJson(output) ? "info" : "warn",
        );
        return { output, threadId };
      }

      // Heartbeat: keep the dashboard honest about what the reader is doing
      if (Date.now() - lastHeartbeat > 60_000) {
        lastHeartbeat = Date.now();
        const minutes = Math.round((Date.now() - startedAt) / 60_000);
        await updateSite(site.id, {
          phase_detail: `sessão ${threadId}: ${status ?? "streamando"} há ${minutes}min`,
          last_progress_at: new Date().toISOString(),
        }).catch(() => {});
      }
    } catch (err) {
      if (Date.now() >= deadline) break;
      const message = err instanceof Error ? err.message : String(err);
      // 4xx from the route is permanent — bubble it up instead of spinning
      if (/\((400|401|403|404)\)/.test(message)) throw err;
      console.warn(`[decopilot] stream reconnect (${message.slice(0, 120)})`);
    }
    await sleep(STREAM_RECONNECT_DELAY_MS);
  }

  await addEvent(
    site.id,
    `Sessão ${threadId} atingiu o timeout de ${Math.round(timeoutMs / 60_000)}min sem RESULT_JSON`,
    "warn",
  );
  return { output, threadId };
}

async function getThreadStatus(
  ctx: WorkerCtx,
  threadId: string,
): Promise<string | null> {
  try {
    const result = await callSelfTool<{ item?: { status?: string } }>(
      ctx,
      "COLLECTION_THREADS_GET",
      { id: threadId },
      20_000,
    );
    return result?.item?.status ?? null;
  } catch {
    return null;
  }
}

interface ThreadMessagePart extends Record<string, unknown> {
  type?: string;
  text?: string;
}

async function listThreadMessages(
  ctx: WorkerCtx,
  threadId: string,
): Promise<Array<{ role?: string; parts?: ThreadMessagePart[] }>> {
  const result = await callSelfTool<{
    messages?: Array<{ role?: string; parts?: ThreadMessagePart[] }>;
    items?: Array<{ role?: string; parts?: ThreadMessagePart[] }>;
  }>(
    ctx,
    "COLLECTION_THREAD_MESSAGES_LIST",
    { thread_id: threadId, limit: 200 },
    30_000,
  );
  return result?.messages ?? result?.items ?? [];
}

/** Assistant text parts of the thread — where the RESULT_JSON lives after completion. */
async function fetchThreadFinalText(
  ctx: WorkerCtx,
  threadId: string,
): Promise<string> {
  try {
    const messages = await listThreadMessages(ctx, threadId);
    return messages
      .filter((m) => m.role === "assistant")
      .flatMap((m) => m.parts ?? [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n");
  } catch {
    return "";
  }
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Command text goes to sitemig_runs.meta and the dashboard — mask secrets. */
function redactSecrets(cmd: string): string {
  return cmd
    .replace(/x-access-token:[^@\s]+@/g, "x-access-token:***@")
    .replace(
      /\b(gh[pousr]_|github_pat_|sk-ant-|sk-|aik_|or-)[A-Za-z0-9_-]{8,}/g,
      "$1***",
    )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]{8,}/gi, "$1***")
    .replace(
      /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)=\S+/g,
      "$1=***",
    );
}

/** Session cost/tokens — MONITORING_THREAD_USAGE arg/result shapes vary. */
async function fetchThreadUsage(
  ctx: WorkerCtx,
  threadId: string,
): Promise<RunMeta["usage"]> {
  for (const args of [{ threadId }, { thread_id: threadId }]) {
    try {
      const raw = await callSelfTool<Record<string, unknown>>(
        ctx,
        "MONITORING_THREAD_USAGE",
        args,
        20_000,
      );
      if (!raw || typeof raw !== "object") continue;
      const totals = (raw.totals ?? raw.usage ?? raw.item ?? raw) as Record<
        string,
        unknown
      >;
      const usage = {
        inputTokens: num(totals.inputTokens ?? totals.input_tokens),
        outputTokens: num(totals.outputTokens ?? totals.output_tokens),
        totalTokens: num(totals.totalTokens ?? totals.total_tokens),
        costUsd: num(
          totals.costUsd ?? totals.cost_usd ?? totals.totalCost ?? totals.cost,
        ),
      };
      if (Object.values(usage).some((v) => v !== undefined)) return usage;
    } catch {
      // try the next arg shape
    }
  }
  return undefined;
}

/**
 * Bash commands the session ran, from the thread's tool parts (UIMessage
 * tool parts: type "tool-<name>", input, output). Best-effort — shapes vary
 * by harness; this is the "what was task 59 doing" answer in the dashboard.
 */
async function fetchThreadCommands(
  ctx: WorkerCtx,
  threadId: string,
): Promise<RunMeta["commands"]> {
  try {
    const messages = await listThreadMessages(ctx, threadId);
    const commands: NonNullable<RunMeta["commands"]> = [];
    for (const message of messages) {
      for (const part of message.parts ?? []) {
        const type = typeof part.type === "string" ? part.type : "";
        const toolName =
          typeof part.toolName === "string"
            ? part.toolName
            : type.startsWith("tool-")
              ? type.slice(5)
              : "";
        if (!/bash|shell|terminal|exec|command/i.test(toolName)) continue;
        const input = (part.input ?? part.args ?? {}) as Record<
          string,
          unknown
        >;
        const cmd =
          typeof input.command === "string"
            ? input.command
            : typeof input.cmd === "string"
              ? input.cmd
              : "";
        if (!cmd) continue;
        const output = (part.output ?? {}) as Record<string, unknown>;
        commands.push({
          cmd: redactSecrets(cmd).slice(0, 160),
          exit: num(output.exitCode ?? output.exit_code ?? output.exit),
        });
        if (commands.length >= 40) return commands;
      }
    }
    return commands.length > 0 ? commands : undefined;
  } catch {
    return undefined;
  }
}

export const decopilotDriver: SandboxDriver = {
  name: "decopilot",

  async prepareProject(
    site: SiteRow,
    ctx: WorkerCtx,
  ): Promise<{ virtualMcpId: string }> {
    if (site.virtual_mcp_id) return { virtualMcpId: site.virtual_mcp_id };
    return { virtualMcpId: await createVirtualMcp(site, ctx) };
  },

  async ensure(site: SiteRow, ctx: WorkerCtx): Promise<SandboxInfo> {
    const virtualMcpId =
      site.virtual_mcp_id ?? (await createVirtualMcp(site, ctx));

    const result = await sandboxStart(virtualMcpId, workBranch(site), ctx);
    if (!result.sandboxHandle) {
      throw new Error(
        `SANDBOX_START returned no sandboxHandle: ${JSON.stringify(result).slice(0, 200)}`,
      );
    }
    return {
      handle: result.sandboxHandle,
      previewUrl: result.previewUrl ?? null,
      virtualMcpId,
    };
  },

  async runTask(
    site: SiteRow,
    ctx: WorkerCtx,
    task: SandboxTaskInput,
  ): Promise<SandboxTaskResult> {
    if (!site.virtual_mcp_id) {
      throw new Error(
        `Site ${site.name} has no virtual_mcp_id for the session`,
      );
    }
    const timeoutMs = task.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    const { output, threadId } = await runDecopilotSession(
      ctx,
      site,
      site.virtual_mcp_id,
      task.prompt,
      timeoutMs,
      task.runId,
      task.threadId,
    );
    const tail = output.slice(-4000);
    const result = parseResultJson(output);

    // Post-session telemetry — never blocks the outcome.
    const [usage, commands] = await Promise.all([
      fetchThreadUsage(ctx, threadId),
      fetchThreadCommands(ctx, threadId),
    ]);
    const meta: RunMeta = { threadId, usage, commands };

    if (!result) {
      return {
        ok: false,
        output: tail,
        threadId,
        meta,
        error: "session ended without a RESULT_JSON line",
      };
    }
    return {
      ok: result.ok,
      output: tail,
      parityScore: result.parityScore,
      parsed: result,
      threadId,
      meta,
      error: result.ok
        ? undefined
        : (result.detail ?? "task reported ok=false"),
    };
  },

  async keepalive(site: SiteRow, ctx: WorkerCtx): Promise<void> {
    if (!site.virtual_mcp_id) return;
    // SANDBOX_START on an existing VM is the documented way to reset the idle TTL
    await sandboxStart(site.virtual_mcp_id, workBranch(site), ctx);
  },

  async destroy(site: SiteRow, ctx: WorkerCtx): Promise<void> {
    if (!site.virtual_mcp_id) return;
    // With "auto" we don't know which kind was picked — try both, best-effort.
    const kinds =
      ctx.config.sandboxKind === "auto"
        ? (["user-desktop", "agent-sandbox"] as const)
        : ([ctx.config.sandboxKind] as const);
    for (const kind of kinds) {
      try {
        await callSelfTool(ctx, "SANDBOX_DELETE", {
          virtualMcpId: site.virtual_mcp_id,
          branch: workBranch(site),
          sandboxProviderKind: kind,
        });
        return;
      } catch {
        // sandbox may already be reaped by the idle TTL — try the next kind
      }
    }
  },
};
