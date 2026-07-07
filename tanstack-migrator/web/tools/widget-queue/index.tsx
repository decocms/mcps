import { Loader2, Play, Plus, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PipelineStepper } from "@/components/pipeline-stepper.tsx";
import { usePollingTool, useToolCaller } from "@/hooks/use-tool.ts";
import { cn } from "@/lib/utils.ts";
import type { DashboardData, SiteView } from "@/types.ts";
import { ACTIVE_STATUSES_SET } from "@/lib/status.ts";

const MAX_NEXT = 6;
/** Widget shows the suggestions column once it's at least this wide (≈2 cols). */
const WIDE_PX = 560;

/** True when the observed element is at least `px` wide. */
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

export default function WidgetQueuePage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const wide = useWide(rootRef, WIDE_PX);
  const { data, loading, error, refresh } = usePollingTool<DashboardData>(
    "TANSTACK_MIGRATOR_WIDGET_QUEUE",
    {},
    8000,
  );
  const callTool = useToolCaller();

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
    <div ref={rootRef}>
      {loading && !data ? (
        <div className="flex h-full min-h-[8rem] items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : error && !data ? (
        <div className="p-4 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : (
        <div
          className={cn("grid gap-3 p-3", wide ? "grid-cols-2" : "grid-cols-1")}
        >
          {/* ── coluna 1: fila real ── */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Fila de migração</span>
              {q && (
                <span className="text-[11px] text-muted-foreground">
                  {q.active}/{q.maxConcurrent} slots
                  {q.provider === "manual" ? " · simulação" : ""}
                </span>
              )}
            </div>

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
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <p
                          className="flex-1 truncate text-xs font-medium"
                          title={s.name}
                        >
                          {s.name}
                        </p>
                        {s.assigneeAvatarUrl && (
                          <img
                            src={s.assigneeAvatarUrl}
                            alt={s.assigneeLogin ?? ""}
                            title={`@${s.assigneeLogin}`}
                            className="h-4 w-4 shrink-0 rounded-full ring-1 ring-border"
                          />
                        )}
                      </div>
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

          {/* ── coluna 2: sugestões (só quando largo) ── */}
          {wide && <SuggestionsColumn onAdded={refresh} />}
        </div>
      )}
    </div>
  );
}

interface Suggestion {
  name: string;
  repo: string;
  prodUrl: string | null;
  thumbUrl: string | null;
  cogsUsd: number;
  top3: boolean;
}

function SuggestionsColumn({ onAdded }: { onAdded: () => void }) {
  const { data, loading, refresh } = usePollingTool<{
    configured: boolean;
    sites: Suggestion[];
  }>("SITE_SUGGESTIONS", {}, 30_000);
  const callTool = useToolCaller();
  const [adding, setAdding] = useState<string | null>(null);

  const add = async (s: Suggestion) => {
    if (!s.prodUrl) return;
    setAdding(s.repo);
    try {
      await callTool("SITE_REGISTER", {
        sourceRepo: s.repo,
        prodUrl: s.prodUrl,
        startNow: false,
      });
      refresh();
      onAdded();
    } finally {
      setAdding(null);
    }
  };

  const suggestions = data?.sites ?? [];

  return (
    <div className="flex flex-col gap-2 border-l border-border pl-3">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-semibold">Sugestões</span>
        <span className="text-[10px] text-muted-foreground">por custo/mês</span>
      </div>

      {loading && !data ? (
        <div className="flex min-h-[6rem] items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : suggestions.length > 0 ? (
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
          {suggestions.map((s) => (
            <SuggestionRow
              key={s.repo}
              s={s}
              busy={adding === s.repo}
              onAdd={() => add(s)}
            />
          ))}
        </div>
      ) : !data?.configured ? (
        <p className="py-3 text-center text-[11px] text-muted-foreground">
          Conecte o Grafana (COGS) para ver sugestões de próximos sites.
        </p>
      ) : (
        <p className="py-3 text-center text-[11px] text-muted-foreground">
          Nenhuma sugestão — tudo caro já está na fila. 🎉
        </p>
      )}
    </div>
  );
}

/** Company logo from the prod domain (DuckDuckGo icon service — no tracking). */
function faviconUrl(prodUrl: string | null): string | null {
  if (!prodUrl) return null;
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(prodUrl).hostname}.ico`;
  } catch {
    return null;
  }
}

/** Logo → screenshot → placeholder, falling through on load error. */
function SiteIcon({
  prodUrl,
  thumbUrl,
}: {
  prodUrl: string | null;
  thumbUrl: string | null;
}) {
  const chain = [faviconUrl(prodUrl), thumbUrl].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  if (idx >= chain.length) {
    return <div className="h-6 w-6 shrink-0 rounded bg-muted" />;
  }
  return (
    <img
      src={chain[idx]}
      alt=""
      className="h-6 w-6 shrink-0 rounded bg-muted object-contain"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

function SuggestionRow({
  s,
  busy,
  onAdd,
}: {
  s: Suggestion;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      <SiteIcon prodUrl={s.prodUrl} thumbUrl={s.thumbUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1 truncate text-xs font-medium">
          {s.top3 && (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-1 text-[9px] font-bold text-amber-600 dark:text-amber-400">
              TOP
            </span>
          )}
          <span className="truncate" title={s.name}>
            {s.name}
          </span>
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          ${Math.round(s.cogsUsd).toLocaleString()}/mês
        </span>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={busy || !s.prodUrl}
        title={s.prodUrl ? "Adicionar ao backlog" : "Sem URL de produção"}
        className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {busy ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
        ) : (
          <Plus className="h-2.5 w-2.5" />
        )}
        add
      </button>
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
      {site.assigneeAvatarUrl && (
        <img
          src={site.assigneeAvatarUrl}
          alt={site.assigneeLogin ?? ""}
          title={`@${site.assigneeLogin}`}
          className="h-4 w-4 shrink-0 rounded-full ring-1 ring-border"
        />
      )}
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
