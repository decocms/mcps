import { CircleDot, Loader2 } from "lucide-react";
import { ParityBar } from "@/components/parity-bar.tsx";
import { PipelineStepper } from "@/components/pipeline-stepper.tsx";
import { StatusBadge } from "@/components/status-badge.tsx";
import { usePollingTool } from "@/hooks/use-tool.ts";
import type { SiteView } from "@/types.ts";

interface WidgetActiveData {
  site: SiteView | null;
  updatedAt: string;
}

export default function WidgetActivePage() {
  const { data, loading, error } = usePollingTool<WidgetActiveData>(
    "TANSTACK_MIGRATOR_WIDGET_ACTIVE",
    {},
    8000,
  );

  if (loading && !data) {
    return (
      <div className="flex h-full min-h-[8rem] items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // only surface errors when there's no prior snapshot — a transient poll
  // failure shouldn't blank a widget that already has data
  if (error && !data) {
    return (
      <div className="p-4 text-xs text-red-600 dark:text-red-400">{error}</div>
    );
  }

  const site = data?.site ?? null;

  if (!site) {
    return (
      <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-1 p-4 text-center">
        <CircleDot className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">No migrations queued.</p>
      </div>
    );
  }

  const isDone = site.status === "done";

  return (
    // fill the tile (home wrapper is h-full overflow-hidden) and scroll if the
    // tile is shorter than the content instead of getting clipped
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto p-3">
      {/* name on its own line, badge below — avoids the truncate+badge clash */}
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

      <PipelineStepper
        status={site.status}
        resumeStatus={site.resumeStatus}
        phaseDetail={site.phaseDetail}
        compact
      />

      <ParityBar score={site.parityScore} target={site.parityTarget} compact />

      {site.phaseDetail && !isDone && (
        <p className="line-clamp-1 text-[11px] text-muted-foreground">
          {site.phaseDetail}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
        {site.issuesTotal > 0 && (
          <span>
            issues {site.issuesClosed}/{site.issuesTotal}
          </span>
        )}
        {site.fixSessionsDone > 0 && (
          <span>
            fixes {site.fixSessionsDone}/{site.maxFixSessions}
          </span>
        )}
        {site.costTotal > 0 && <span>${site.costTotal.toFixed(2)}</span>}
      </div>
    </div>
  );
}
