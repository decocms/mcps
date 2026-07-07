import {
  CircleDot,
  ExternalLink,
  GitBranch,
  Github,
  GitPullRequest,
  Globe,
  Loader2,
  Monitor,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ParityBar } from "@/components/parity-bar.tsx";
import { PipelineStepper } from "@/components/pipeline-stepper.tsx";
import { StatusBadge } from "@/components/status-badge.tsx";
import { usePollingTool } from "@/hooks/use-tool.ts";
import { cn } from "@/lib/utils.ts";
import type { SiteView } from "@/types.ts";

interface WidgetActiveData {
  site: SiteView | null;
  updatedAt: string;
}

/** Lay metrics + links out in more columns once the tile is at least this wide. */
const WIDE_PX = 520;

function useWide(
  ref: React.RefObject<HTMLElement | null>,
  px: number,
): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWide(e.contentRect.width >= px);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, px]);
  return wide;
}

export default function WidgetActivePage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const wide = useWide(rootRef, WIDE_PX);
  const { data, loading, error } = usePollingTool<WidgetActiveData>(
    "TANSTACK_MIGRATOR_WIDGET_ACTIVE",
    {},
    8000,
  );

  const site = data?.site ?? null;

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto p-3"
    >
      {loading && !data ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : error && !data ? (
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : !site ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4 text-center">
          <CircleDot className="h-5 w-5 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">No migrations queued.</p>
        </div>
      ) : (
        <ActiveSite site={site} wide={wide} />
      )}
    </div>
  );
}

function ActiveSite({ site, wide }: { site: SiteView; wide: boolean }) {
  const isDone = site.status === "done";
  return (
    <>
      {/* header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span
            className="flex-1 truncate text-sm font-semibold"
            title={site.name}
          >
            {site.name}
          </span>
          {site.assigneeAvatarUrl && (
            <img
              src={site.assigneeAvatarUrl}
              alt={site.assigneeLogin ?? ""}
              title={`@${site.assigneeLogin}`}
              className="h-5 w-5 shrink-0 rounded-full ring-1 ring-border"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={site.status} />
          {site.parityScore !== null && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {Math.round(site.parityScore)}%
            </span>
          )}
        </div>
      </div>

      {/* wide tile → labeled steps (uses the horizontal space); small → dots only */}
      <PipelineStepper
        status={site.status}
        resumeStatus={site.resumeStatus}
        phaseDetail={site.phaseDetail}
        compact={!wide}
      />

      <ParityBar
        score={site.parityScore}
        target={site.parityTarget}
        baselineScore={site.baselineScore}
      />

      {site.phaseDetail && !isDone && (
        <p className="line-clamp-2 text-[11px] text-muted-foreground">
          {site.phaseDetail}
        </p>
      )}

      {/* metrics + links fill the remaining space instead of stretching the stepper */}
      <Metrics site={site} wide={wide} />
      <Links site={site} />
    </>
  );
}

function Metrics({ site, wide }: { site: SiteView; wide: boolean }) {
  const cards: Array<{ label: string; value: string }> = [];
  if (site.parityScore !== null) {
    cards.push({
      label: `parity · target ${site.parityTarget}%`,
      value: `${Math.round(site.parityScore)}%`,
    });
  }
  cards.push({
    label: "rounds",
    value: `${site.iterationsDone}/${site.maxIterations}`,
  });
  if (site.issuesTotal > 0) {
    cards.push({
      label: "issues closed",
      value: `${site.issuesClosed}/${site.issuesTotal}`,
    });
  }
  if (site.fixSessionsDone > 0) {
    cards.push({
      label: "fix sessions",
      value: `${site.fixSessionsDone}/${site.maxFixSessions}`,
    });
  }
  if (site.costTotal > 0) {
    cards.push({ label: "AI cost", value: `$${site.costTotal.toFixed(2)}` });
  }
  if (site.costBeforeUsd != null) {
    cards.push({
      label: "infra/mo (est.)",
      value: `≈$${Math.round((site.costBeforeUsd * 30) / 7).toLocaleString()}`,
    });
  }
  if (cards.length === 0) return null;

  return (
    <div className={cn("grid gap-2", wide ? "grid-cols-4" : "grid-cols-2")}>
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-md border border-border bg-card px-2.5 py-1.5"
        >
          <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">
            {c.label}
          </p>
          <p className="text-sm font-semibold tabular-nums">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function LinkChip({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Github;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
      title={label}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="max-w-[12rem] truncate">{label}</span>
    </a>
  );
}

function Links({ site }: { site: SiteView }) {
  const ghUrl = (repo: string | null) =>
    repo ? `https://github.com/${repo}` : null;
  const chips: Array<{ href: string; label: string; icon: typeof Github }> = [];
  if (site.sourceRepo)
    chips.push({
      href: ghUrl(site.sourceRepo)!,
      label: site.sourceRepo,
      icon: Github,
    });
  if (site.targetRepo)
    chips.push({
      href: ghUrl(site.targetRepo)!,
      label: site.targetRepo,
      icon: GitBranch,
    });
  if (site.prUrl)
    chips.push({
      href: site.prUrl,
      label: `PR #${site.prNumber ?? "?"}`,
      icon: GitPullRequest,
    });
  if (site.prodUrl)
    chips.push({ href: site.prodUrl, label: "production", icon: Globe });
  if (site.previewUrl && site.previewReady)
    chips.push({ href: site.previewUrl, label: "preview", icon: Monitor });
  if (site.cfDeployUrl)
    chips.push({ href: site.cfDeployUrl, label: "deploy", icon: ExternalLink });
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <LinkChip key={c.label} href={c.href} label={c.label} icon={c.icon} />
      ))}
    </div>
  );
}
