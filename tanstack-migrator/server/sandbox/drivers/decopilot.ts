/**
 * Decopilot driver — live mode via the same path the agentic CMS uses
 * (verified against mesh main @ 2026-07-03, apps/mesh/src/tools/{sandbox,virtual}):
 *
 *   project:   COLLECTION_VIRTUAL_MCP_CREATE on {meshUrl}/mcp/self creates the
 *              virtual MCP bound to the repo (metadata.githubRepo {url, owner,
 *              name, connectionId?, installationId?}).
 *   lifecycle: SANDBOX_START / SANDBOX_DELETE management tools on /mcp/self
 *              ({virtualMcpId, branch, sandboxProviderKind: "agent-sandbox"}).
 *              Re-calling SANDBOX_START resets the idle TTL (keepalive).
 *   execution: bounded decopilot sessions (claude-code provider) at
 *              {meshUrl}/api/{org}/decopilot/stream — mesh runs the agent
 *              loop and executes bash/edits inside the sandbox via its
 *              internal vm tools.
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

/** Model routed to the mesh-side Claude Code coding agent. Override per pod if needed. */
const DECOPILOT_MODEL_ID =
  process.env.MIGRATOR_DECOPILOT_MODEL ?? "claude-code:sonnet";

const DEFAULT_TASK_TIMEOUT_MS = 45 * 60_000;
const SANDBOX_BRANCH = "main";

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

/** One bounded decopilot session; resolves with the final assistant text. */
async function runDecopilotSession(
  ctx: WorkerCtx,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const base = resolveMeshUrl(ctx.meshUrl);
  const url = `${base}/api/${ctx.organizationId}/decopilot/stream`;
  if (!ctx.meshToken) {
    throw new Error("No mesh token available for decopilot sessions");
  }

  const body = {
    messages: [
      {
        id: `migrator-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: prompt }],
      },
    ],
    models: {
      thinking: {
        id: DECOPILOT_MODEL_ID,
        provider: "claude-code",
      },
    },
    stream: true,
    toolApprovalLevel: "auto" as const,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.meshToken}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `decopilot stream failed (${response.status}): ${errorText.slice(0, 300)}`,
    );
  }
  if (!response.body) {
    throw new Error("decopilot stream returned no body");
  }

  return await collectFullStreamText(response.body);
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
    const timeoutMs = task.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    const output = await runDecopilotSession(ctx, task.prompt, timeoutMs);
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
