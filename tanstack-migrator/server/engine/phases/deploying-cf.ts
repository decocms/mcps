/**
 * Phase: deploying_cf — deploy to Cloudflare Workers.
 *
 * Two paths:
 *   - CLOUDFLARE_API_TOKEN set: run `npm run build && wrangler deploy` inside the
 *     sandbox (direct upload — no dashboard, no git integration needed). After deploy,
 *     probe the live URL with previewRendersRealHtml to confirm it works.
 *   - No token: route to needs_human with the one-time dashboard instructions.
 *
 * Simulation always "finishes" so the manual-driver e2e flow completes.
 */

import { SESSION_TIMEOUT_MS } from "../../constants.ts";
import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { getSite, updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import { manualCfInstructions } from "../../lib/cloudflare.ts";
import { parseRepo } from "../../lib/github.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { previewRendersRealHtml } from "../../lib/preview.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import { deployPrompt } from "../../sandbox/templates/prompts.ts";

/** After a successful deploy, advance to parity (measured against the CF URL). */
async function advanceToParity(
  site: SiteRow,
  patch: Partial<SiteRow>,
): Promise<void> {
  await updateSite(site.id, {
    ...patch,
    status: "paritying",
    phase_detail: "deploy ok — iniciando medição de paridade contra a URL real",
    last_progress_at: new Date().toISOString(),
  });
  await addEvent(
    site.id,
    `Deploy CF ok em ${patch.cf_deploy_url ?? "?"} — avançando para paridade`,
  );
}

export async function deployingCf(
  site: SiteRow,
  ctx: WorkerCtx,
): Promise<void> {
  if (!site.target_repo) throw new Error("target_repo not set");
  const workerName = parseRepo(site.target_repo).repo;

  if (isSimulation(ctx)) {
    await advanceToParity(site, {
      cf_project_name: workerName,
      cf_deploy_url: `https://${workerName}.deco-cx.workers.dev`,
    });
    return;
  }

  const cfToken = ctx.config.cloudflareApiToken;
  if (!cfToken) {
    // No token: show one-time dashboard instructions and park.
    const prNote = site.pr_number
      ? ` Depois de conectar, o PR #${site.pr_number} ganha um preview deploy; o merge em main faz o go-live.`
      : "";
    await updateSite(site.id, {
      status: "needs_human",
      resume_status: "deploying",
      cf_project_name: workerName,
      cf_deploy_url: `https://${workerName}.deco-cx.workers.dev`,
      needs_human_reason:
        manualCfInstructions({ workerName, repoFull: site.target_repo }) +
        prNote +
        " Alternativa: configure CLOUDFLARE_API_TOKEN no MCP para o deploy automático.",
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Deploy CF: sem CLOUDFLARE_API_TOKEN — configure o token para deploy automático ou siga as instruções de dashboard.`,
      "warn",
    );
    try {
      await getDriver(ctx).destroy(site, ctx);
    } catch {
      // idle TTL will reap it anyway
    }
    return;
  }

  // Automated path: run `npm run build && wrangler deploy` inside the sandbox.
  await addEvent(
    site.id,
    "Iniciando deploy automático no Cloudflare Workers...",
  );
  await updateSite(site.id, {
    phase_detail: "buildando e deployando no Cloudflare Workers...",
    last_progress_at: new Date().toISOString(),
  });

  const run = await createRun({ siteId: site.id, kind: "migrate" });

  try {
    const result = await getDriver(ctx).runTask(site, ctx, {
      kind: "deploy",
      prompt: deployPrompt({ site, cfApiToken: cfToken }),
      runId: run.id,
      timeoutMs: SESSION_TIMEOUT_MS.migrate,
    });

    const current = await getSite(site.id);
    if (!current || current.status !== "deploying") {
      await finishRun(run.id, {
        status: "failed",
        logsTail: `[abandonado: site saiu de deploying durante a sessão]`,
        meta: result.meta,
      });
      return;
    }

    // Extract the deployed URL from wrangler stdout or the RESULT_JSON line.
    const urlMatch = result.output.match(
      /https:\/\/[\w-]+\.[\w-]+\.workers\.dev/,
    );
    const deployUrl = urlMatch
      ? urlMatch[0]
      : `https://${workerName}.deco-cx.workers.dev`;

    if (result.ok) {
      await finishRun(run.id, {
        status: "succeeded",
        logsTail: result.output,
        meta: result.meta,
      });

      // Probe the live URL — this is the real verification (no sandbox proxy).
      const rendersReal = await previewRendersRealHtml(deployUrl, 15_000);
      if (rendersReal) {
        await addEvent(
          site.id,
          `Deploy CF ok + HTML real confirmado em ${deployUrl}`,
        );
      } else {
        await addEvent(
          site.id,
          `Deploy CF ok mas ${deployUrl} ainda não serve HTML real (pode estar aquecendo — tente em 1 min)`,
          "warn",
        );
      }

      await advanceToParity(current, {
        cf_project_name: workerName,
        cf_deploy_url: deployUrl,
      });
    } else {
      await finishRun(run.id, {
        status: "failed",
        logsTail: result.output,
        meta: result.meta,
      });
      await updateSite(current.id, {
        status: "needs_human",
        resume_status: "deploying",
        needs_human_reason: `wrangler deploy falhou: ${result.error ?? result.output.slice(-300)}`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        current.id,
        `Deploy CF falhou — verifique os logs`,
        "error",
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(run.id, { status: "failed", logsTail: message });
    const current = await getSite(site.id);
    if (current) {
      await updateSite(current.id, {
        status: "needs_human",
        resume_status: "deploying",
        needs_human_reason: `Erro no deploy CF: ${message}`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(current.id, `Erro no deploy CF: ${message}`, "error");
    }
  }
}
