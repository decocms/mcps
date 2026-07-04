import {
  CircleDot,
  ExternalLink,
  GitBranch,
  Github,
  GitPullRequest,
  Globe,
} from "lucide-react";
import { ParityBar } from "@/components/parity-bar.tsx";
import { StatusBadge } from "@/components/status-badge.tsx";
import { cn, duration, timeAgo } from "@/lib/utils.ts";
import type { SiteView } from "@/types.ts";

export function issuesFilterUrl(targetRepo: string | null): string | null {
  return targetRepo
    ? `https://github.com/${targetRepo}/issues?q=is%3Aissue+label%3Atanstack-migrator`
    : null;
}

/** Thin closed/total progress over the GitHub-issue backlog. */
function IssuesBar({ site }: { site: SiteView }) {
  if (site.issuesTotal <= 0) return null;
  const pct = Math.min(
    100,
    Math.round((site.issuesClosed / site.issuesTotal) * 100),
  );
  const href = issuesFilterUrl(site.targetRepo);
  const bar = (
    <span className="flex w-full items-center gap-2">
      <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
        <CircleDot className="h-3 w-3" />
        issues {site.issuesClosed}/{site.issuesTotal}
      </span>
    </span>
  );
  if (!href) return bar;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="w-full hover:opacity-80"
      title="Abrir issues label:tanstack-migrator no GitHub"
    >
      {bar}
    </a>
  );
}

function RepoLink({
  repo,
  label,
  icon: Icon,
}: {
  repo: string | null;
  label: string;
  icon: typeof Github;
}) {
  if (!repo) return null;
  const isUrl = repo.startsWith("http");
  const href = isUrl ? repo : `https://github.com/${repo}`;
  const text = isUrl ? label : repo;
  return (
    // w-fit/self-start: the anchor must hug its text — a stretched anchor
    // makes "empty" card space open external links instead of the drawer
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex w-fit max-w-full items-center gap-1 self-start truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
      title={text}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{text}</span>
    </a>
  );
}

export function SiteCard({
  site,
  onClick,
  simulation,
}: {
  site: SiteView;
  onClick: () => void;
  simulation?: boolean;
}) {
  const isDone = site.status === "done";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-lg border border-border bg-card p-4 text-left transition-shadow hover:shadow-md",
        site.status === "needs_human" && "border-amber-500/40",
        site.status === "failed" && "border-red-500/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{site.name}</span>
          {simulation && !isDone && (
            <span className="shrink-0 rounded-full border border-dashed border-amber-500/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              simulação
            </span>
          )}
        </span>
        <StatusBadge status={site.status} />
      </div>

      <ParityBar score={site.parityScore} target={site.parityTarget} />
      {!isDone && <IssuesBar site={site} />}

      {site.phaseDetail && !isDone && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {site.phaseDetail}
        </p>
      )}
      {site.needsHumanReason && (
        <p className="line-clamp-2 text-xs text-amber-600 dark:text-amber-400">
          {site.needsHumanReason}
        </p>
      )}
      {site.error && site.status === "failed" && (
        <p className="line-clamp-2 text-xs text-red-600 dark:text-red-400">
          {site.error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <RepoLink repo={site.sourceRepo} label="source" icon={Github} />
        <RepoLink repo={site.targetRepo} label="tanstack" icon={GitBranch} />
        {site.prUrl && (
          <RepoLink
            repo={site.prUrl}
            label={`PR #${site.prNumber ?? "?"} (${site.workBranch})`}
            icon={GitPullRequest}
          />
        )}
        <div className="flex items-center gap-3">
          <RepoLink repo={site.prodUrl} label="produção" icon={Globe} />
          {site.previewUrl && site.previewReady && (
            <RepoLink
              repo={site.previewUrl}
              label="preview"
              icon={ExternalLink}
            />
          )}
          {site.previewUrl && !site.previewReady && (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground/60"
              title="Sandbox criado — o link aparece quando o dev server responder"
            >
              <ExternalLink className="h-3 w-3" />
              sandbox criado
            </span>
          )}
          {site.cfDeployUrl && (
            <RepoLink
              repo={site.cfDeployUrl}
              label="deploy"
              icon={ExternalLink}
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {site.status === "fixing"
            ? `sessões ${site.fixSessionsDone}/${site.maxFixSessions}`
            : site.status === "paritying" ||
                site.status.startsWith("validating") ||
                isDone
              ? `rodada ${site.iterationsDone}/${site.maxIterations}`
              : `cadastrado ${timeAgo(site.createdAt)}`}
        </span>
        <span>
          {isDone
            ? `durou ${duration(site.startedAt, site.finishedAt)}`
            : `atualizado ${timeAgo(site.updatedAt)}`}
        </span>
      </div>
    </button>
  );
}
