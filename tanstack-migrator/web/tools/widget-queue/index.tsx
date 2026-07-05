import { Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge.tsx";
import { usePollingTool } from "@/hooks/use-tool.ts";
import type { DashboardData } from "@/types.ts";

export default function WidgetQueuePage() {
  const { data, loading, error } = usePollingTool<DashboardData>(
    "TANSTACK_MIGRATOR_WIDGET_QUEUE",
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
  if (error && !data) {
    return (
      <div className="p-4 text-xs text-red-600 dark:text-red-400">{error}</div>
    );
  }

  const sites = data?.sites ?? [];
  const q = data?.queue;

  return (
    // top-aligned + compact; scroll only if the list gets long
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Fila de migração</span>
        {q && (
          <span className="text-[11px] text-muted-foreground">
            {q.active}/{q.maxConcurrent} slots
            {q.provider === "manual" ? " · simulação" : ""}
          </span>
        )}
      </div>

      <div className="flex max-h-48 flex-col divide-y divide-border overflow-y-auto">
        {sites.length === 0 && (
          <p className="py-2 text-xs text-muted-foreground">
            Nenhum site em migração.
          </p>
        )}
        {sites.map((s) => (
          <div key={s.id} className="flex items-center gap-2 py-1.5">
            <span
              className="flex-1 truncate text-xs font-medium"
              title={s.name}
            >
              {s.name}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {s.parityScore !== null ? `${Math.round(s.parityScore)}%` : "—"}
            </span>
            <StatusBadge status={s.status} />
          </div>
        ))}
      </div>

      {q && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-border pt-1.5 text-[11px] text-muted-foreground tabular-nums">
          <span>{q.active} migrando</span>
          <span>{q.queued} na fila</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            {q.done} concluídos
          </span>
          {q.needsHuman > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {q.needsHuman} precisam de humano
            </span>
          )}
        </div>
      )}
    </div>
  );
}
