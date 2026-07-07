import { FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToolCaller } from "@/hooks/use-tool.ts";
import {
  clockTime,
  cn,
  duration,
  studioThreadUrl,
  timeAgo,
} from "@/lib/utils.ts";
import type { ReportUrls, RunView } from "@/types.ts";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-muted-foreground",
};

export function RunRow({ run }: { run: RunView }) {
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
      if (urls.reportHtml)
        window.open(urls.reportHtml, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("report urls failed", err);
    } finally {
      setLoadingReport(false);
    }
  };

  const takenIssues = run.meta?.issues?.taken;
  const kindLabel: Record<string, string> = {
    migrate: "migration script",
    triage: "triage",
    fix: takenIssues?.length
      ? `fix ${takenIssues.map((n) => `#${n}`).join(" ")}`
      : `fix ${run.iteration}`,
    parity: `parity ${run.iteration}`,
    fix_iteration: `iteration ${run.iteration}`,
    install_sync: "sync install",
    deploy_cf: "deploy CF",
  };
  const usage = run.meta?.usage;
  const issueMoves = run.meta?.issues;
  const hasIssueMoves =
    (issueMoves?.taken?.length ?? 0) +
      (issueMoves?.resolved?.length ?? 0) +
      (issueMoves?.blocked?.length ?? 0) +
      (issueMoves?.created ?? 0) >
    0;
  const hasUsage =
    usage?.costUsd !== undefined || usage?.totalTokens !== undefined;

  return (
    <div className="rounded-md border border-border">
      {/* div (not button) — the header contains interactive children
          (thread link, report), which is invalid nesting inside a button */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left"
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
          {/* running rows show live elapsed time (re-rendered by the 10s poll) */}
          <span className="text-muted-foreground tabular-nums">
            {run.finishedAt
              ? duration(run.startedAt, run.finishedAt)
              : `${duration(run.startedAt, new Date().toISOString())}…`}
          </span>
          {run.threadId && (
            <a
              href={studioThreadUrl(run.threadId)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex max-w-28 items-center gap-1 truncate rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
              title={`Open the session thread in studio: ${run.threadId}`}
            >
              {run.threadId}
            </a>
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
              title="Open full HTML report"
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
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-2 text-xs">
          {!run.summary?.topIssues?.length &&
            !run.logsTail &&
            !heatmaps?.length &&
            !run.meta?.commands?.length &&
            !hasIssueMoves &&
            !hasUsage && (
              <p className="text-muted-foreground">
                No logs for this session
                {run.threadId ? ` — thread ${run.threadId}` : ""}
                {run.status === "running" ? " (still running)" : ""}.
              </p>
            )}
          {(hasIssueMoves || hasUsage) && (
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              {issueMoves?.taken && issueMoves.taken.length > 0 && (
                <span>
                  issues: {issueMoves.taken.map((n) => `#${n}`).join(", ")}
                </span>
              )}
              {issueMoves?.resolved && issueMoves.resolved.length > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  resolved: {issueMoves.resolved.map((n) => `#${n}`).join(", ")}
                </span>
              )}
              {issueMoves?.blocked && issueMoves.blocked.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  blocked:{" "}
                  {issueMoves.blocked.map((b) => `#${b.number}`).join(", ")}
                </span>
              )}
              {issueMoves?.created !== undefined && issueMoves.created > 0 && (
                <span>created on GitHub: {issueMoves.created}</span>
              )}
              {usage?.costUsd !== undefined && (
                <span className="tabular-nums">
                  cost ${usage.costUsd.toFixed(2)}
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
                {run.meta.commands.length} session commands
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
