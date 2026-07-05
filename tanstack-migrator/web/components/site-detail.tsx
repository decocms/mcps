import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  DollarSign,
  ExternalLink,
  Loader2,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ParityBar } from "@/components/parity-bar.tsx";
import { PipelineStepper } from "@/components/pipeline-stepper.tsx";
import { RunRow } from "@/components/run-row.tsx";
import { issuesFilterUrl } from "@/components/site-card.tsx";
import { StatusBadge } from "@/components/status-badge.tsx";
import { TerminalPanel } from "@/components/terminal-panel.tsx";
import { usePollingTool, useToolCaller } from "@/hooks/use-tool.ts";
import { clockTime, cn, timeAgo } from "@/lib/utils.ts";
import type { RunView, SiteDetail, SiteView } from "@/types.ts";

const ACTIVE_STATUSES = new Set([
  "creating_repo",
  "provisioning_sandbox",
  "migrating_script",
  "opening_pr",
  "triaging",
  "fixing",
  "paritying",
  "deploying",
]);

/** Active site whose row hasn't moved in >5min looks stuck — surface it. */
function isStalled(site: SiteView): boolean {
  if (!ACTIVE_STATUSES.has(site.status)) return false;
  return Date.now() - Date.parse(site.updatedAt) > 5 * 60_000;
}

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

/** Live preview of the migrated site running in the sandbox (collapsible). */
function PreviewPanel({ site }: { site: SiteView }) {
  const [open, setOpen] = useState(false);
  if (!site.previewUrl) return null;

  if (!site.previewReady) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Monitor className="h-3.5 w-3.5 shrink-0" />
        Sandbox criado — o preview aparece quando o dev server responder.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <Monitor className="h-3.5 w-3.5 text-emerald-500" />
          Preview ao vivo
        </button>
        <a
          href={site.previewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          abrir <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {open && (
        <div className="border-t border-border">
          <iframe
            src={site.previewUrl}
            title="preview"
            className="aspect-[16/10] w-full bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}

type Tab = "overview" | "runs" | "terminal" | "activity";
type RunFilter = "all" | "migrate" | "triage" | "fix" | "parity";

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
  const {
    data,
    refresh,
    error: loadError,
  } = usePollingTool<SiteDetail>("SITE_GET", { siteId }, 10_000);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [runFilter, setRunFilter] = useState<RunFilter>("all");

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
  const runs = data?.runs ?? [];
  const events = data?.events ?? [];

  // total tokens across all runs (backend persists per-run usage)
  const totalTokens = useMemo(
    () => runs.reduce((sum, r) => sum + (r.meta?.usage?.totalTokens ?? 0), 0),
    [runs],
  );

  const filteredRuns = useMemo(() => {
    if (runFilter === "all") return runs;
    return runs.filter((r: RunView) =>
      runFilter === "fix"
        ? r.kind === "fix" || r.kind === "fix_iteration"
        : r.kind === runFilter,
    );
  }, [runs, runFilter]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-border bg-background shadow-2xl">
        {/* ── sticky header ── */}
        <div className="shrink-0 border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold">
                {site?.name ?? "…"}
              </h2>
              {site && <StatusBadge status={site.status} />}
              {site && isStalled(site) && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                  title={`Sem atualização há ${timeAgo(site.updatedAt)} — pode estar travado`}
                >
                  <CircleDot className="h-2.5 w-2.5" />
                  parado?
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {site && (
            <div className="px-4 pb-3">
              {/* key metrics */}
              <div className="mb-2 flex items-center gap-3">
                <ParityBar
                  score={site.parityScore}
                  target={site.parityTarget}
                />
                <div className="flex shrink-0 items-center gap-2.5 text-[11px] text-muted-foreground tabular-nums">
                  {site.issuesTotal > 0 && (
                    <span title="issues fechadas/total">
                      {site.issuesClosed}/{site.issuesTotal} issues
                    </span>
                  )}
                  {site.costTotal > 0 && (
                    <span
                      className="inline-flex items-center"
                      title="custo acumulado"
                    >
                      <DollarSign className="h-3 w-3" />
                      {site.costTotal.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              {/* pipeline stepper — always visible */}
              <PipelineStepper
                status={site.status}
                resumeStatus={site.resumeStatus}
                phaseDetail={site.phaseDetail}
              />
            </div>
          )}

          {/* tabs */}
          {site && (
            <div className="flex gap-1 border-t border-border px-2">
              {(
                [
                  ["overview", "Visão geral"],
                  ["runs", `Runs ${runs.length}`],
                  ["terminal", "Terminal"],
                  ["activity", `Atividade ${events.length}`],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative px-3 py-2 text-xs font-medium",
                    tab === id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                  {tab === id && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── body ── */}
        {loadError && /not found/i.test(loadError) ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Este site foi excluído — os dados não existem mais.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Fechar
            </button>
          </div>
        ) : !site ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {tab === "overview" && (
              <>
                {simulation && site.status !== "done" && (
                  <div className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                    Modo simulação (SANDBOX_PROVIDER=manual): nenhum efeito
                    externo — repos, sandbox e deploy são fictícios. Troque para{" "}
                    <code>decopilot</code> no state pra migrar de verdade.
                  </div>
                )}

                {site.phaseDetail && (
                  <p className="text-xs text-muted-foreground">
                    {site.phaseDetail}
                  </p>
                )}

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

                <PreviewPanel site={site} />

                {/* stats */}
                {(site.issuesTotal > 0 ||
                  site.fixSessionsDone > 0 ||
                  site.costTotal > 0 ||
                  totalTokens > 0) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      iteração {site.iterationsDone}/{site.maxIterations}
                      {site.bestScore !== null &&
                        ` · melhor ${Math.round(site.bestScore)}%`}
                    </span>
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
                    {totalTokens > 0 && (
                      <span className="tabular-nums">
                        {Math.round(totalTokens / 1000)}k tokens
                      </span>
                    )}
                  </div>
                )}

                {/* actions */}
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
                  {(site.status === "failed" ||
                    site.status === "needs_human") && (
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
                  {[
                    "done",
                    "failed",
                    "paused",
                    "needs_human",
                    "queued",
                  ].includes(site.status) && (
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

                {/* links */}
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
              </>
            )}

            {tab === "runs" && (
              <>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["all", "Todos"],
                      ["migrate", "Script"],
                      ["triage", "Triagem"],
                      ["fix", "Fixes"],
                      ["parity", "Paridade"],
                    ] as [RunFilter, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRunFilter(id)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                        runFilter === id
                          ? "border-primary bg-primary/15 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5">
                  {filteredRuns.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum run{runFilter !== "all" ? " deste tipo" : " ainda"}
                      .
                    </p>
                  )}
                  {filteredRuns.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </div>
              </>
            )}

            {tab === "terminal" && (
              <TerminalPanel
                siteId={siteId}
                active={ACTIVE_STATUSES.has(site.status)}
              />
            )}

            {tab === "activity" && (
              <ul className="flex flex-col gap-1">
                {events.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma atividade ainda.
                  </p>
                )}
                {events.map((event) => (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
