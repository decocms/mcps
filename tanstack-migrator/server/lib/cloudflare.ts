/**
 * Cloudflare Workers Builds — create the git-connected project so pushes to
 * the -tanstack repo deploy automatically (same setup granadobr-tanstack
 * uses, minus the dashboard clicks).
 *
 * The Workers Builds API is recent; the exact endpoint shape is a
 * VERIFY-ON-PHASE-C item. Everything here degrades to a clear error that the
 * deploy-cf phase turns into a needs_human note with manual instructions.
 */

import type { WorkerCtx } from "./mesh.ts";

const CF_API = "https://api.cloudflare.com/client/v4";

async function cfFetch<T>(
  ctx: WorkerCtx,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = ctx.config.cloudflareApiToken;
  if (!token) {
    throw new Error("CLOUDFLARE_API_TOKEN is not configured in the MCP state.");
  }
  const response = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(60_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    result?: T;
    errors?: Array<{ code: number; message: string }>;
  };
  if (!response.ok || payload.success === false) {
    const detail =
      payload.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ??
      `HTTP ${response.status}`;
    throw new Error(`Cloudflare API ${path} failed — ${detail}`);
  }
  return payload.result as T;
}

export async function workerExists(
  ctx: WorkerCtx,
  name: string,
): Promise<boolean> {
  try {
    await cfFetch(
      ctx,
      `/accounts/${ctx.config.cloudflareAccountId}/workers/services/${name}`,
    );
    return true;
  } catch {
    return false;
  }
}

export interface CfProjectResult {
  projectName: string;
  deployUrl: string | null;
}

/**
 * Create the Workers Builds project connected to the GitHub repo.
 * Throws with a descriptive message when the API rejects — the phase maps
 * that to needs_human with manual instructions.
 */
export async function createWorkersBuildsProject(
  ctx: WorkerCtx,
  input: { workerName: string; repoFull: string; branch?: string },
): Promise<CfProjectResult> {
  const accountId = ctx.config.cloudflareAccountId;
  const [owner, repo] = input.repoFull.split("/");

  // VERIFY-ON-PHASE-C: Workers Builds trigger creation endpoint. Shape based
  // on the beta API (builds/triggers); adjust after probing with the real token.
  await cfFetch(ctx, `/accounts/${accountId}/builds/triggers`, {
    method: "POST",
    body: JSON.stringify({
      external_script_id: input.workerName,
      trigger_name: `${input.workerName}-main`,
      repo_connection: { provider: "github", owner, repo },
      branch_includes: [input.branch ?? "main"],
      build_command: "npm run build",
      deploy_command: "npx wrangler deploy",
      root_directory: "/",
    }),
  });

  return {
    projectName: input.workerName,
    deployUrl: `https://${input.workerName}.deco-cx.workers.dev`,
  };
}

export function manualCfInstructions(input: {
  workerName: string;
  repoFull: string;
}): string {
  return (
    `Criar o projeto Workers Builds manualmente: Cloudflare dashboard → Workers & Pages → ` +
    `Create → Import a repository → ${input.repoFull} (build: npm run build; deploy: npx wrangler deploy; ` +
    `worker name: ${input.workerName}). Depois marque a fase como concluída com SITE_RETRY.`
  );
}
