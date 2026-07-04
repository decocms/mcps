/**
 * Phase: fixing — the issue-draining loop. Each pass is ONE short session
 * over a severity-picked batch (1 critical/high alone, or up to
 * FIX_BATCH_SIZE medium/low of the same category), with the issue bodies
 * inlined in the prompt. The MCP closes/blocks the issues afterwards from
 * the session's RESULT_JSON — the agent never touches GitHub.
 */

import { SESSION_TIMEOUT_MS } from "../../constants.ts";
import { addEvent } from "../../db/events.ts";
import { createRun, finishRun } from "../../db/runs.ts";
import { getSite, incrementCost, updateSite } from "../../db/sites.ts";
import type { SiteRow } from "../../db/types.ts";
import { ghsTokenForSite } from "../../lib/github.ts";
import {
  closeResolvedIssues,
  markBlockedIssues,
  refreshIssueCounts,
  selectIssuesForFixSession,
} from "../../lib/issues.ts";
import type { WorkerCtx } from "../../lib/mesh.ts";
import { getDriver, isSimulation } from "../../sandbox/client.ts";
import { fixIssuesPrompt } from "../../sandbox/templates/prompts.ts";
import type { EngineDeps } from "../machine.ts";
import { clearStaleSession, markSessionStart } from "./session-guard.ts";
import { failOrAutoRetry } from "./transient.ts";

async function budgetExhausted(site: SiteRow): Promise<void> {
  await updateSite(site.id, {
    status: "needs_human",
    resume_status: "fixing",
    needs_human_reason: `Orçamento de ${site.max_fix_sessions} sessões de fix esgotado com ${site.issues_open} issues abertas. Veja https://github.com/${site.target_repo}/issues?q=is%3Aissue+is%3Aopen+label%3Atanstack-migrator`,
    last_progress_at: new Date().toISOString(),
  });
  await addEvent(
    site.id,
    "Orçamento de sessões de fix esgotado — precisa de humano",
    "warn",
  );
}

export async function fixing(
  site: SiteRow,
  ctx: WorkerCtx,
  deps: EngineDeps,
): Promise<void> {
  // Terminal checks first (idempotent re-entry)
  if (site.parity_score !== null && site.parity_score >= site.parity_target) {
    await updateSite(site.id, {
      status: "deploying",
      phase_detail: `paridade ${site.parity_score} >= ${site.parity_target}, indo pro deploy`,
      last_progress_at: new Date().toISOString(),
    });
    await addEvent(
      site.id,
      `Paridade atingiu ${site.parity_score}% — deploy CF`,
    );
    return;
  }
  if (deps.inflight.has(site.id)) return;
  const proceed = await clearStaleSession(site, deps);
  if (!proceed) return;

  // Pick the batch — GitHub is the source of truth (simulation uses counters).
  // The backlog-empty check comes BEFORE the session budget: a drained
  // backlog must advance to paritying even when the budget just ran out.
  let batch: Array<{ number: number; title: string; body?: string }> = [];
  if (isSimulation(ctx)) {
    if (site.issues_open <= 0) {
      await updateSite(site.id, {
        status: "paritying",
        phase_detail: "[simulação] backlog drenado, medindo paridade",
        last_progress_at: new Date().toISOString(),
      });
      return;
    }
    if (site.fix_sessions_done >= site.max_fix_sessions) {
      await budgetExhausted(site);
      return;
    }
  } else {
    const counts = await refreshIssueCounts(ctx, site);
    if (counts.open === 0) {
      await updateSite(site.id, {
        status: "paritying",
        phase_detail: "backlog drenado, medindo paridade",
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(site.id, "Backlog de issues drenado — rodada de paridade");
      return;
    }
    if (site.fix_sessions_done >= site.max_fix_sessions) {
      await budgetExhausted(site);
      return;
    }
    const selected = selectIssuesForFixSession(
      counts.openIssues,
      ctx.config.fixBatchSize,
    );
    if (selected.length === 0) {
      // everything open is blocked — measuring parity may unblock/reprioritize
      await updateSite(site.id, {
        status: "paritying",
        phase_detail: `${counts.open} issues abertas mas todas bloqueadas — medindo paridade`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        "Todas as issues abertas estão bloqueadas — rodada de paridade",
        "warn",
      );
      return;
    }
    batch = selected.map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body,
    }));
  }

  const sessionNumber = site.fix_sessions_done + 1;
  const run = await createRun({
    siteId: site.id,
    kind: "fix",
    iteration: sessionNumber,
  });
  await markSessionStart(site.id, `fix-${sessionNumber}`);
  await addEvent(
    site.id,
    `Sessão de fix ${sessionNumber}/${site.max_fix_sessions} iniciada${batch.length > 0 ? ` — issues ${batch.map((b) => `#${b.number}`).join(", ")}` : ""}`,
  );

  deps.inflight.start(site.id, `fix-${sessionNumber}`, async () => {
    try {
      let prompt = "";
      if (!isSimulation(ctx)) {
        const { token, grant } = await ghsTokenForSite(ctx, site);
        if (grant?.refreshToken) {
          await updateSite(site.id, {
            gh_refresh_token: grant.refreshToken,
            gh_token_endpoint: grant.tokenEndpoint ?? null,
            gh_client_id: grant.clientId ?? null,
          });
        }
        prompt = fixIssuesPrompt({ site, issues: batch, ghToken: token });
      }

      const result = await getDriver(ctx).runTask(site, ctx, {
        kind: "fix",
        prompt,
        runId: run.id,
        iteration: sessionNumber,
        threadId: site.phase_thread_id ?? undefined,
        timeoutMs: SESSION_TIMEOUT_MS.fix,
      });
      await incrementCost(site.id, result.meta?.usage?.costUsd);

      const current = await getSite(site.id);
      if (!current || current.status !== "fixing") {
        // site paused/changed mid-session — close the run row so the
        // history never shows a phantom "running" entry
        await finishRun(run.id, {
          status: "failed",
          logsTail: `[abandonada: site saiu de fixing durante a sessão]`,
          meta: result.meta,
        });
        return;
      }

      if (!result.ok) {
        await finishRun(run.id, {
          status: "failed",
          logsTail: result.output,
          meta: result.meta,
        });
        await failOrAutoRetry(
          current,
          result.error ?? "sessão de fix falhou",
          "fixing",
          "Sessão de fix falhou",
        );
        return;
      }

      if (isSimulation(ctx)) {
        const resolvedCount = Math.min(
          ctx.config.fixBatchSize,
          current.issues_open,
        );
        await finishRun(run.id, {
          status: "succeeded",
          logsTail: result.output,
          meta: { issues: { resolved: [] } },
        });
        await updateSite(site.id, {
          fix_sessions_done: sessionNumber,
          issues_open: current.issues_open - resolvedCount,
          issues_closed: current.issues_closed + resolvedCount,
          sandbox_session_id: null,
          phase_thread_id: null,
          transient_retries: 0,
          phase_detail: `[simulação] fix ${sessionNumber}: ${resolvedCount} issues fechadas`,
          last_progress_at: new Date().toISOString(),
        });
        await addEvent(
          site.id,
          `[simulação] Sessão de fix ${sessionNumber}: ${resolvedCount} issues fechadas`,
        );
        return;
      }

      const batchNumbers = new Set(batch.map((b) => b.number));
      const resolved = (result.parsed?.resolved ?? []).filter((n) =>
        batchNumbers.has(n),
      );
      const blocked = (result.parsed?.blocked ?? []).filter((b) =>
        batchNumbers.has(b.number),
      );
      await closeResolvedIssues(ctx, current, resolved, result.threadId);
      const openIssues = await refreshIssueCounts(ctx, current);
      await markBlockedIssues(ctx, current, blocked, openIssues.openIssues);

      await finishRun(run.id, {
        status: "succeeded",
        logsTail: result.output,
        meta: {
          ...result.meta,
          issues: {
            taken: batch.map((b) => b.number),
            resolved,
            blocked,
          },
        },
      });
      await updateSite(site.id, {
        fix_sessions_done: sessionNumber,
        sandbox_session_id: null,
        phase_thread_id: null, // each batch is a fresh, narrow conversation
        transient_retries: 0,
        phase_detail: `fix ${sessionNumber}: ${resolved.length}/${batch.length} resolvidas, backlog ${openIssues.open}`,
        last_progress_at: new Date().toISOString(),
      });
      await addEvent(
        site.id,
        `Sessão de fix ${sessionNumber}: resolvidas ${resolved.length > 0 ? resolved.map((n) => `#${n}`).join(", ") : "nenhuma"}${blocked.length > 0 ? ` · bloqueadas ${blocked.map((b) => `#${b.number}`).join(", ")}` : ""} — backlog ${openIssues.open}`,
      );
      // next tick re-enters: backlog empty → paritying; budget out → needs_human
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishRun(run.id, { status: "failed", logsTail: message });
      const current = await getSite(site.id);
      if (current) {
        await failOrAutoRetry(
          current,
          message,
          "fixing",
          "Sessão de fix falhou",
        );
      }
    }
  });
}
