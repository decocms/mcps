import { Loader2, Play } from "lucide-react";
import { PipelineStepper } from "@/components/pipeline-stepper.tsx";
import { usePollingTool, useToolCaller } from "@/hooks/use-tool.ts";
import { cn } from "@/lib/utils.ts";
import type { DashboardData, SiteView } from "@/types.ts";
import { ACTIVE_STATUSES_SET } from "@/lib/status.ts";

const MAX_NEXT = 6;

export default function WidgetQueuePage() {
  const { data, loading, error, refresh } = usePollingTool<DashboardData>(
    "TANSTACK_MIGRATOR_WIDGET_QUEUE",
    {},
    8000,
  );
  const callTool = useToolCaller();

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

  const active = sites.filter((s) => ACTIVE_STATUSES_SET.has(s.status));
  const next = sites
    .filter((s) => s.status === "draft" || s.status === "queued")
    .sort((a, b) => {
      const pa = a.queuePosition ?? 9999;
      const pb = b.queuePosition ?? 9999;
      return pa !== pb ? pa - pb : a.createdAt.localeCompare(b.createdAt);
    })
    .slice(0, MAX_NEXT);

  const enqueue = async (siteId: string) => {
    await callTool("SITE_ENQUEUE", { siteId });
    refresh();
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Fila de migração</span>
        {q && (
          <span className="text-[11px] text-muted-foreground">
            {q.active}/{q.maxConcurrent} slots
            {q.provider === "manual" ? " · simulação" : ""}
          </span>
        )}
      </div>

      {/* ── Em andamento ── */}
      {active.length > 0 && (
        <section>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Em andamento
          </p>
          <div className="flex flex-col gap-2">
            {active.map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                <p
                  className="mb-1.5 truncate text-xs font-medium"
                  title={s.name}
                >
                  {s.name}
                </p>
                <PipelineStepper
                  status={s.status}
                  resumeStatus={s.resumeStatus}
                  phaseDetail={s.phaseDetail}
                  compact
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Próximos ── */}
      {next.length > 0 && (
        <section>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Próximos
          </p>
          <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
            {next.map((s, idx) => (
              <NextRow
                key={s.id}
                site={s}
                pos={idx + 1}
                onEnqueue={() => enqueue(s.id)}
              />
            ))}
          </div>
        </section>
      )}

      {active.length === 0 && next.length === 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground">
          Nenhuma migração em andamento ou na fila.
        </p>
      )}

      {/* counters */}
      {q && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-border pt-1.5 text-[11px] text-muted-foreground tabular-nums">
          <span>{q.active} migrando</span>
          <span>{q.queued} na fila</span>
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

function NextRow({
  site,
  pos,
  onEnqueue,
}: {
  site: SiteView;
  pos: number;
  onEnqueue: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      <span className="w-5 shrink-0 text-center text-[11px] font-bold tabular-nums text-muted-foreground">
        {pos}
      </span>
      <span className="flex-1 truncate text-xs font-medium" title={site.name}>
        {site.name}
      </span>
      {site.status === "draft" ? (
        <button
          type="button"
          onClick={onEnqueue}
          title="Iniciar migração"
          className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground hover:opacity-90"
        >
          <Play className="h-2.5 w-2.5" />
          Iniciar
        </button>
      ) : (
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
          )}
        >
          fila
        </span>
      )}
    </div>
  );
}
