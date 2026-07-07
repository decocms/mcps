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
  UserCircle2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
        Sandbox created — the preview appears once the dev server responds.
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
          Live preview
        </button>
        <a
          href={site.previewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          open <ExternalLink className="h-3 w-3" />
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

interface GhContributor {
  login: string;
  avatar_url: string;
}

function useContributors(repo: string) {
  const [list, setList] = useState<GhContributor[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!repo) return;
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/contributors?per_page=30`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (res.ok) {
        const json = (await res.json()) as GhContributor[];
        setList(json.filter((c) => !c.login.endsWith("[bot]")));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return { list, loading, load };
}

function AssigneePicker({
  site,
  onAssign,
}: {
  site: {
    assigneeLogin: string | null;
    assigneeAvatarUrl: string | null;
    sourceRepo: string;
  };
  onAssign: (login: string | null, avatarUrl: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { list, loading, load } = useContributors(site.sourceRepo);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    load();
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        title={
          site.assigneeLogin ? `@${site.assigneeLogin}` : "Assign assignee"
        }
      >
        {site.assigneeAvatarUrl ? (
          <img
            src={site.assigneeAvatarUrl}
            alt={site.assigneeLogin ?? ""}
            className="h-4 w-4 rounded-full"
          />
        ) : (
          <UserCircle2 className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">
          {site.assigneeLogin ? `@${site.assigneeLogin}` : "Assign"}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-md border border-border bg-card shadow-lg">
          {site.assigneeLogin && (
            <button
              type="button"
              onClick={() => {
                onAssign(null, null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Remove assignee
            </button>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : list.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No public contributors
            </p>
          ) : (
            list.map((c) => (
              <button
                key={c.login}
                type="button"
                onClick={() => {
                  onAssign(c.login, c.avatar_url);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted",
                  site.assigneeLogin === c.login && "bg-muted font-semibold",
                )}
              >
                <img
                  src={c.avatar_url}
                  alt={c.login}
                  className="h-5 w-5 rounded-full"
                />
                {c.login}
              </button>
            ))
          )}
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
  const tabBarRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);

  // Escape closes the drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const action = async (tool: string, extra?: Record<string, unknown>) => {
    setBusy(tool);
    setError(null);
    try {
      await callTool(tool, { siteId, ...extra });
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
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
      setError(err instanceof Error ? err.message : "Delete failed");
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
              {site?.assigneeAvatarUrl && (
                <img
                  src={site.assigneeAvatarUrl}
                  alt={site.assigneeLogin ?? ""}
                  title={`@${site.assigneeLogin}`}
                  className="h-5 w-5 shrink-0 rounded-full ring-1 ring-border"
                />
              )}
              {site && isStalled(site) && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                  title={`No update in ${timeAgo(site.updatedAt)} — may be stuck`}
                >
                  <CircleDot className="h-2.5 w-2.5" />
                  stalled?
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
                  baselineScore={site.baselineScore}
                />
                <div className="flex shrink-0 items-center gap-2.5 text-[11px] text-muted-foreground tabular-nums">
                  {site.issuesTotal > 0 && (
                    <span title="issues closed/total">
                      {site.issuesClosed}/{site.issuesTotal} issues
                    </span>
                  )}
                  {site.costTotal > 0 && (
                    <span
                      className="inline-flex items-center"
                      title="cumulative cost"
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
            <div
              ref={tabBarRef}
              role="tablist"
              className="flex gap-1 border-t border-border px-2"
              onKeyDown={(e) => {
                const tabs: Tab[] = [
                  "overview",
                  "runs",
                  "terminal",
                  "activity",
                ];
                const cur = tabs.indexOf(tab);
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  setTab(tabs[(cur + 1) % tabs.length]);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  setTab(tabs[(cur - 1 + tabs.length) % tabs.length]);
                } else if (e.key === "Home") {
                  e.preventDefault();
                  setTab(tabs[0]);
                } else if (e.key === "End") {
                  e.preventDefault();
                  setTab(tabs[tabs.length - 1]);
                }
              }}
            >
              {(
                [
                  ["overview", "Overview"],
                  ["runs", `Runs ${runs.length}`],
                  ["terminal", "Terminal"],
                  ["activity", `Activity ${events.length}`],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  tabIndex={tab === id ? 0 : -1}
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
              This site was deleted — the data no longer exists.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Close
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
                    Simulation mode (SANDBOX_PROVIDER=manual): no external
                    effects — repos, sandbox and deploy are fake. Switch to{" "}
                    <code>decopilot</code> in the state to migrate for real.
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

                {/* before/after baseline card */}
                {site.baselineScore !== null && (
                  <div className="rounded-md border border-border bg-card p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Before / After
                    </p>
                    <div className="flex items-center gap-3 text-xs tabular-nums">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-muted-foreground">before</span>
                        <span className="text-sm font-bold">
                          {Math.round(site.baselineScore)}%
                        </span>
                      </div>
                      <div className="flex-1">
                        <ParityBar
                          score={site.parityScore}
                          target={site.parityTarget}
                          baselineScore={site.baselineScore}
                        />
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-muted-foreground">now</span>
                        <span className="text-sm font-bold">
                          {site.parityScore !== null
                            ? `${Math.round(site.parityScore)}%`
                            : "—"}
                        </span>
                      </div>
                    </div>
                    {site.parityScore !== null &&
                      site.parityScore > site.baselineScore && (
                        <p className="mt-1.5 text-center text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          +{Math.round(site.parityScore - site.baselineScore)}{" "}
                          pp improvement
                        </p>
                      )}
                    {site.costTotal > 0 && (
                      <p className="mt-1 text-center text-[10px] text-muted-foreground">
                        migration cost: ${site.costTotal.toFixed(2)}
                      </p>
                    )}
                    {site.costBeforeUsd != null && (
                      <p className="mt-1 text-center text-[10px] text-muted-foreground">
                        infra cost: before ≈$
                        {Math.round(
                          (site.costBeforeUsd * 30) / 7,
                        ).toLocaleString()}
                        /mo · after <span className="italic">coming soon</span>
                      </p>
                    )}
                  </div>
                )}

                {/* stats */}
                {(site.issuesTotal > 0 ||
                  site.fixSessionsDone > 0 ||
                  site.costTotal > 0 ||
                  totalTokens > 0) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      iteration {site.iterationsDone}/{site.maxIterations}
                      {site.bestScore !== null &&
                        ` · best ${Math.round(site.bestScore)}%`}
                    </span>
                    {site.issuesTotal > 0 &&
                      (issuesFilterUrl(site.targetRepo) ? (
                        <a
                          href={issuesFilterUrl(site.targetRepo) ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="tabular-nums hover:underline"
                          title="Issues label:tanstack-migrator on GitHub"
                        >
                          issues closed {site.issuesClosed}/{site.issuesTotal}
                        </a>
                      ) : (
                        <span className="tabular-nums">
                          issues closed {site.issuesClosed}/{site.issuesTotal}
                        </span>
                      ))}
                    {site.fixSessionsDone > 0 && (
                      <span className="tabular-nums">
                        fix sessions {site.fixSessionsDone}/
                        {site.maxFixSessions}
                      </span>
                    )}
                    {site.costTotal > 0 && (
                      <span className="tabular-nums">
                        cost ${site.costTotal.toFixed(2)}
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
                      label="Pause"
                      busy={busy === "SITE_PAUSE"}
                      onClick={() => action("SITE_PAUSE")}
                    />
                  )}
                  {site.status === "paused" && (
                    <ActionButton
                      icon={Play}
                      label="Resume"
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
                      label="Mark done"
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
                      label="Archive"
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
                      label={confirmDelete ? "Confirm delete?" : "Delete"}
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

                {/* assignee */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Assignee
                  </span>
                  <AssigneePicker
                    site={site}
                    onAssign={async (login, avatarUrl) => {
                      await callTool("SITE_ASSIGN", {
                        siteId,
                        login,
                        avatarUrl,
                      });
                      refresh();
                      onChanged();
                    }}
                  />
                </div>

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
                    ["Production", site.prodUrl, site.prodUrl],
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
                <div
                  ref={filterBarRef}
                  role="tablist"
                  className="flex flex-wrap gap-1"
                  onKeyDown={(e) => {
                    const filters: RunFilter[] = [
                      "all",
                      "migrate",
                      "triage",
                      "fix",
                      "parity",
                    ];
                    const cur = filters.indexOf(runFilter);
                    if (e.key === "ArrowRight") {
                      e.preventDefault();
                      setRunFilter(filters[(cur + 1) % filters.length]);
                    } else if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      setRunFilter(
                        filters[(cur - 1 + filters.length) % filters.length],
                      );
                    }
                  }}
                >
                  {(
                    [
                      ["all", "All"],
                      ["migrate", "Script"],
                      ["triage", "Triage"],
                      ["fix", "Fixes"],
                      ["parity", "Parity"],
                    ] as [RunFilter, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={runFilter === id}
                      tabIndex={runFilter === id ? 0 : -1}
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
                      No runs{runFilter !== "all" ? " of this type" : " yet"}.
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
                    No activity yet.
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
