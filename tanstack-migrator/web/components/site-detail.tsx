import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { ParityBar } from "@/components/parity-bar.tsx";
import { issuesFilterUrl } from "@/components/site-card.tsx";
import { StatusBadge } from "@/components/status-badge.tsx";
import { usePollingTool, useToolCaller } from "@/hooks/use-tool.ts";
import { duration, clockTime, cn, timeAgo } from "@/lib/utils.ts";
import type { ReportUrls, RunView, SiteDetail } from "@/types.ts";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-muted-foreground",
};

function ActionButton({
  icon: Icon,
  label,
  onClick,
  busy,
  danger,
}: {
  icon: typeof Play;
  label: string;
  onClick: () => void;
  busy: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50",
        danger && "border-red-500/40 text-red-600 dark:text-red-400",
      )}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}

function RunRow({ run }: { run: RunView }) {
  const callTool = useToolCaller();
  const [expanded, setExpanded] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [heatmaps, setHeatmaps] = useState<ReportUrls["heatmaps"] | null>(null);

  const openReport = async () => {
    setLoadingReport(true);
    try {
      const urls = await callTool<ReportUrls>("PARITY_REPORT_URLS", {
        runId: run.id,
      });
      setHeatmaps(urls.heatmaps);
      if (urls.reportHtml) window.open(urls.reportHtml, "_blank");
    } catch (err) {
      console.error("report urls failed", err);
    } finally {
      setLoadingReport(false);
    }
  };

  const kindLabel: Record<string, string> = {
    migrate: "script de migração",
    triage: "triagem",
    fix: `fix ${run.iteration}`,
    parity: `parity ${run.iteration}`,
    fix_iteration: `iteração ${run.iteration}`,
    install_sync: "instalação do sync",
    deploy_cf: "deploy CF",
  };
  const usage = run.meta?.usage;
  const issueMoves = run.meta?.issues;

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              run.status === "succeeded"
                ? "bg-emerald-500"
                : run.status === "failed"
                  ? "bg-red-500"
                  : "animate-pulse bg-blue-500",
            )}
          />
          <span className="font-medium">{kindLabel[run.kind] ?? run.kind}</span>
          <span className="text-muted-foreground tabular-nums">
            {clockTime(run.startedAt)} · {timeAgo(run.startedAt)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {run.finishedAt && (
            <span className="text-muted-foreground tabular-nums">
              {duration(run.startedAt, run.finishedAt)}
            </span>
          )}
          {run.threadId && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard?.writeText(run.threadId ?? "");
              }}
              onKeyDown={(e) => e.key === "Enter" && e.stopPropagation()}
              className="inline-flex max-w-28 items-center gap-1 truncate rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
              title={`Thread da sessão: ${run.threadId} (clique pra copiar)`}
            >
              {run.threadId}
            </span>
          )}
          {run.parityScore !== null && (
            <span className="font-semibold tabular-nums">
              {Math.round(run.parityScore)}%
            </span>
          )}
          {run.hasArtifacts && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                openReport();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  openReport();
                }
              }}
              className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 hover:bg-muted"
              title="Abrir report HTML completo"
            >
              {loadingReport ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              report
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2 text-xs">
          {!run.summary?.topIssues?.length &&
            !run.logsTail &&
            !heatmaps?.length &&
            !run.meta?.commands?.length &&
            !issueMoves && (
              <p className="text-muted-foreground">
                Sem logs desta sessão
                {run.threadId ? ` — thread ${run.threadId}` : ""}
                {run.status === "running" ? " (ainda em execução)" : ""}.
              </p>
            )}
          {(issueMoves || usage) && (
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              {issueMoves?.taken && issueMoves.taken.length > 0 && (
                <span>
                  issues: {issueMoves.taken.map((n) => `#${n}`).join(", ")}
                </span>
              )}
              {issueMoves?.resolved && issueMoves.resolved.length > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  resolvidas:{" "}
                  {issueMoves.resolved.map((n) => `#${n}`).join(", ")}
                </span>
              )}
              {issueMoves?.blocked && issueMoves.blocked.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  bloqueadas:{" "}
                  {issueMoves.blocked.map((b) => `#${b.number}`).join(", ")}
                </span>
              )}
              {issueMoves?.created !== undefined && issueMoves.created > 0 && (
                <span>criadas no GitHub: {issueMoves.created}</span>
              )}
              {usage?.costUsd !== undefined && (
                <span className="tabular-nums">
                  custo ${usage.costUsd.toFixed(2)}
                </span>
              )}
              {usage?.totalTokens !== undefined && (
                <span className="tabular-nums">
                  {Math.round(usage.totalTokens / 1000)}k tokens
                </span>
              )}
            </div>
          )}
          {run.meta?.commands && run.meta.commands.length > 0 && (
            <details className="mb-2">
              <summary className="cursor-pointer text-muted-foreground select-none">
                {run.meta.commands.length} comandos da sessão
              </summary>
              <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-auto font-mono text-[10px] leading-snug">
                {run.meta.commands.map((c, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        c.exit === 0 || c.exit === undefined
                          ? "text-muted-foreground"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {c.exit !== undefined ? `[${c.exit}]` : "[·]"}
                    </span>
                    <span className="truncate" title={c.cmd}>
                      {c.cmd}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {run.summary?.topIssues && run.summary.topIssues.length > 0 && (
            <ul className="flex flex-col gap-1">
              {run.summary.topIssues.map((issue, i) => (
                <li key={i} className="flex gap-1.5">
                  <span
                    className={cn(
                      "font-semibold uppercase",
                      SEVERITY_COLOR[issue.severity] ?? "text-muted-foreground",
                    )}
                  >
                    {issue.severity}
                  </span>
                  <span className="text-muted-foreground">
                    {issue.page ? `${issue.page} — ` : ""}
                    {issue.summary}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {heatmaps && heatmaps.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {heatmaps.map((h) => (
                <a key={h.name} href={h.url} target="_blank" rel="noreferrer">
                  <img
                    src={h.url}
                    alt={h.name}
                    className="h-20 w-full rounded border border-border object-cover object-top"
                  />
                </a>
              ))}
            </div>
          )}
          {run.logsTail && (
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-[10px] leading-snug whitespace-pre-wrap">
              {run.logsTail}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function SiteDetailPanel({
  siteId,
  onClose,
  onChanged,
  simulation,
}: {
  siteId: string;
  onClose: () => void;
  onChanged: () => void;
  simulation?: boolean;
}) {
  const callTool = useToolCaller();
  const { data, refresh } = usePollingTool<SiteDetail>(
    "SITE_GET",
    { siteId },
    10_000,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const action = async (tool: string, extra?: Record<string, unknown>) => {
    setBusy(tool);
    setError(null);
    try {
      await callTool(tool, { siteId, ...extra });
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ação falhou");
    } finally {
      setBusy(null);
    }
  };

  const removeSite = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setBusy("SITE_DELETE");
    setError(null);
    try {
      await callTool("SITE_DELETE", { siteId });
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Exclusão falhou");
      setBusy(null);
    }
  };

  const site = data?.site;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{site?.name ?? "…"}</h2>
            {site && <StatusBadge status={site.status} />}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!site ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {simulation && site.status !== "done" && (
              <div className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                Modo simulação (SANDBOX_PROVIDER=manual): nenhum efeito externo
                — repos, sandbox e deploy são fictícios. Troque para{" "}
                <code>decopilot</code> no state pra migrar de verdade.
              </div>
            )}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Paridade (alvo {site.parityTarget}%)</span>
                <span>
                  iteração {site.iterationsDone}/{site.maxIterations}
                  {site.bestScore !== null &&
                    ` · melhor ${Math.round(site.bestScore)}%`}
                </span>
              </div>
              <ParityBar score={site.parityScore} target={site.parityTarget} />
              {site.phaseDetail && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {site.phaseDetail}
                </p>
              )}
              {(site.issuesTotal > 0 ||
                site.fixSessionsDone > 0 ||
                site.costTotal > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {site.issuesTotal > 0 &&
                    (issuesFilterUrl(site.targetRepo) ? (
                      <a
                        href={issuesFilterUrl(site.targetRepo) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="tabular-nums hover:underline"
                        title="Issues label:tanstack-migrator no GitHub"
                      >
                        issues fechadas {site.issuesClosed}/{site.issuesTotal}
                      </a>
                    ) : (
                      <span className="tabular-nums">
                        issues fechadas {site.issuesClosed}/{site.issuesTotal}
                      </span>
                    ))}
                  {site.fixSessionsDone > 0 && (
                    <span className="tabular-nums">
                      sessões de fix {site.fixSessionsDone}/
                      {site.maxFixSessions}
                    </span>
                  )}
                  {site.costTotal > 0 && (
                    <span className="tabular-nums">
                      custo ${site.costTotal.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {site.needsHumanReason && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs whitespace-pre-wrap">
                {site.needsHumanReason}
              </div>
            )}
            {site.error && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs whitespace-pre-wrap">
                {site.error}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(site.status === "queued" ||
                ![
                  "done",
                  "paused",
                  "failed",
                  "needs_human",
                  "archived",
                ].includes(site.status)) && (
                <ActionButton
                  icon={Pause}
                  label="Pausar"
                  busy={busy === "SITE_PAUSE"}
                  onClick={() => action("SITE_PAUSE")}
                />
              )}
              {site.status === "paused" && (
                <ActionButton
                  icon={Play}
                  label="Retomar"
                  busy={busy === "SITE_RESUME"}
                  onClick={() => action("SITE_RESUME")}
                />
              )}
              {(site.status === "failed" || site.status === "needs_human") && (
                <ActionButton
                  icon={RotateCcw}
                  label="Retry"
                  busy={busy === "SITE_RETRY"}
                  onClick={() => action("SITE_RETRY")}
                />
              )}
              {site.status !== "done" && site.status !== "archived" && (
                <ActionButton
                  icon={CheckCircle2}
                  label="Marcar concluído"
                  busy={busy === "SITE_MARK_DONE"}
                  onClick={() => action("SITE_MARK_DONE")}
                />
              )}
              {["done", "failed", "paused", "needs_human", "queued"].includes(
                site.status,
              ) && (
                <ActionButton
                  icon={Archive}
                  label="Arquivar"
                  busy={busy === "SITE_ARCHIVE"}
                  onClick={() => action("SITE_ARCHIVE")}
                />
              )}
              {[
                "done",
                "failed",
                "paused",
                "needs_human",
                "queued",
                "archived",
              ].includes(site.status) && (
                <ActionButton
                  icon={Trash2}
                  label={confirmDelete ? "Confirmar exclusão?" : "Excluir"}
                  busy={busy === "SITE_DELETE"}
                  danger
                  onClick={removeSite}
                />
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-xs">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1 text-xs">
              {[
                [
                  "Source",
                  site.sourceRepo,
                  `https://github.com/${site.sourceRepo}`,
                ],
                site.targetRepo
                  ? [
                      "TanStack",
                      site.targetRepo,
                      `https://github.com/${site.targetRepo}`,
                    ]
                  : null,
                site.prUrl
                  ? [
                      "PR",
                      `#${site.prNumber ?? "?"} (${site.workBranch} → main)`,
                      site.prUrl,
                    ]
                  : null,
                ["Produção", site.prodUrl, site.prodUrl],
                site.previewUrl && site.previewReady
                  ? ["Preview", site.previewUrl, site.previewUrl]
                  : null,
                site.cfDeployUrl
                  ? ["Deploy", site.cfDeployUrl, site.cfDeployUrl]
                  : null,
              ]
                .filter((x): x is [string, string, string] => !!x)
                .map(([label, text, href]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-muted-foreground">
                      {label}
                    </span>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate hover:underline"
                    >
                      <span className="truncate">{text}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                ))}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                Runs
              </h3>
              <div className="flex flex-col gap-1.5">
                {data.runs.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum run ainda.
                  </p>
                )}
                {data.runs.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                Atividade
              </h3>
              <ul className="flex flex-col gap-1">
                {data.events.map((event) => (
                  <li key={event.id} className="flex gap-2 text-xs">
                    <span
                      className="shrink-0 text-muted-foreground tabular-nums"
                      title={timeAgo(event.createdAt)}
                    >
                      {clockTime(event.createdAt)}
                    </span>
                    <span
                      className={cn(
                        event.level === "error" &&
                          "text-red-600 dark:text-red-400",
                        event.level === "warn" &&
                          "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {event.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
