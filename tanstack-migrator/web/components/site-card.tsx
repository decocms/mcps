import { ExternalLink, GitBranch, Github, Globe } from "lucide-react";
import { ParityBar } from "@/components/parity-bar.tsx";
import { StatusBadge } from "@/components/status-badge.tsx";
import { cn, duration, timeAgo } from "@/lib/utils.ts";
import type { SiteView } from "@/types.ts";

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
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
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
        <div className="flex items-center gap-3">
          <RepoLink repo={site.prodUrl} label="produção" icon={Globe} />
          {site.previewUrl && (
            <RepoLink
              repo={site.previewUrl}
              label="preview"
              icon={ExternalLink}
            />
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
          {site.status === "validating" || isDone
            ? `iteração ${site.iterationsDone}/${site.maxIterations}`
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
