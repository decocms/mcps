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
        <p className="text-xs text-muted-foreground">
          Nenhuma migração na fila.
        </p>
      </div>
    );
  }

  const isDone = site.status === "done";

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{site.name}</span>
        <StatusBadge status={site.status} />
      </div>

      <PipelineStepper
        status={site.status}
        resumeStatus={site.resumeStatus}
        phaseDetail={site.phaseDetail}
        compact
      />

      <ParityBar score={site.parityScore} target={site.parityTarget} />

      {site.phaseDetail && !isDone && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {site.phaseDetail}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
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
