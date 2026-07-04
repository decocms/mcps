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
 *              SANDBOX_START. Claude Code runs mesh-side against that sandbox.
 */

import { collectFullStreamText } from "@decocms/mcps-shared/mesh-chat";
import type { SiteRow } from "../../db/types.ts";
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
const SANDBOX_BRANCH = "main";
/** Reconnect cadence for the thread SSE while the run is still going. */
const STREAM_RECONNECT_DELAY_MS = 3_000;

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
      branch: SANDBOX_BRANCH,
      ...(kind === "auto" ? {} : { sandboxProviderKind: kind }),
    },
    180_000,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One bounded decopilot run: POST a user message onto a fresh thread
 * (202 + queued dispatch), then consume the thread SSE until the run
 * produces the RESULT_JSON line or the timeout expires. The SSE replays
 * from the stream buffer, so reconnecting is safe.
 */
async function runDecopilotSession(
  ctx: WorkerCtx,
  virtualMcpId: string,
  prompt: string,
  timeoutMs: number,
  kind: string,
): Promise<string> {
  const base = resolveMeshUrl(ctx.meshUrl);
  // decopilot routes are keyed by org SLUG (an org-id 404s: "organization not found")
  const org = ctx.organizationSlug ?? ctx.organizationId;
  if (!ctx.meshToken) {
    throw new Error("No mesh token available for decopilot sessions");
  }

  const threadId = `mig-${crypto.randomUUID()}`;
  const postUrl = `${base}/api/${org}/decopilot/threads/${threadId}/messages`;

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
    branch: SANDBOX_BRANCH,
    toolApprovalLevel: "auto" as const,
    harnessId: "claude-code" as const,
    ...(kind === "auto" ? {} : { sandboxProviderKind: kind }),
  };

  const post = await fetch(postUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.meshToken}`,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!post.ok && post.status !== 202) {
    const errorText = await post.text();
    throw new Error(
      `decopilot message dispatch failed (${post.status}): ${errorText.slice(0, 300)}`,
    );
  }

  // Consume the thread stream until RESULT_JSON shows up or time runs out.
  const streamUrl = `${base}/api/${org}/decopilot/threads/${threadId}/stream`;
  const deadline = Date.now() + timeoutMs;
  let output = "";

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
        if (parseResultJson(output)) return output;
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

  return output;
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

    const result = await sandboxStart(virtualMcpId, ctx);
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
    const output = await runDecopilotSession(
      ctx,
      site.virtual_mcp_id,
      task.prompt,
      timeoutMs,
      ctx.config.sandboxKind,
    );
    const tail = output.slice(-4000);
    const result = parseResultJson(output);

    if (!result) {
      return {
        ok: false,
        output: tail,
        error: "session ended without a RESULT_JSON line",
      };
    }
    return {
      ok: result.ok,
      output: tail,
      parityScore: result.parityScore,
      error: result.ok
        ? undefined
        : (result.detail ?? "task reported ok=false"),
    };
  },

  async keepalive(site: SiteRow, ctx: WorkerCtx): Promise<void> {
    if (!site.virtual_mcp_id) return;
    // SANDBOX_START on an existing VM is the documented way to reset the idle TTL
    await sandboxStart(site.virtual_mcp_id, ctx);
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
          branch: SANDBOX_BRANCH,
          sandboxProviderKind: kind,
        });
        return;
      } catch {
        // sandbox may already be reaped by the idle TTL — try the next kind
      }
    }
  },
};
