import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { RegisterModal } from "@/components/register-modal.tsx";
import { SiteCard } from "@/components/site-card.tsx";
import { SiteDetailPanel } from "@/components/site-detail.tsx";
import { usePollingTool, useToolCaller } from "@/hooks/use-tool.ts";
import { clockTime, cn } from "@/lib/utils.ts";
import type { DashboardData, SiteView } from "@/types.ts";

type Tab = "backlog" | "migrating" | "needs_human" | "done";

const TAB_META: Array<{ id: Tab; label: string }> = [
  { id: "backlog", label: "Backlog" },
  { id: "migrating", label: "Em migração" },
  { id: "needs_human", label: "Precisa de humano" },
  { id: "done", label: "100% TanStack" },
];

function bucketOf(site: SiteView): Tab {
  if (site.status === "done") return "done";
  if (site.status === "draft" || site.status === "queued") return "backlog";
  if (
    site.status === "needs_human" ||
    site.status === "failed" ||
    site.status === "awaiting_merge"
  ) {
    return "needs_human";
  }
  return "migrating";
}

function BacklogList({
  sites,
  onRefresh,
  onSelect,
}: {
  sites: SiteView[];
  onRefresh: () => void;
  onSelect: (id: string) => void;
}) {
  const callTool = useToolCaller();
  const [busy, setBusy] = useState<string | null>(null);

  const enqueue = async (siteId: string) => {
    setBusy(siteId);
    try {
      await callTool("SITE_ENQUEUE", { siteId });
      onRefresh();
    } finally {
      setBusy(null);
    }
  };

  const move = async (fromIdx: number, dir: -1 | 1) => {
    const toIdx = fromIdx + dir;
    if (toIdx < 0 || toIdx >= sites.length) return;
    const reordered = [...sites];
    [reordered[fromIdx], reordered[toIdx]] = [
      reordered[toIdx],
      reordered[fromIdx],
    ];
    setBusy("reorder");
    try {
      await callTool("SITE_REORDER", {
        orderedIds: reordered.map((s) => s.id),
      });
      onRefresh();
    } finally {
      setBusy(null);
    }
  };

  if (sites.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Nenhum site no backlog.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-md border border-border">
      {sites.map((site, idx) => (
        <div
          key={site.id}
          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40"
        >
          {/* position badge */}
          <span className="w-6 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
            {idx + 1}
          </span>

          {/* up / down */}
          <div className="flex shrink-0 flex-col">
            <button
              type="button"
              disabled={idx === 0 || busy === "reorder"}
              onClick={() => move(idx, -1)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
              title="Subir prioridade"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={idx === sites.length - 1 || busy === "reorder"}
              onClick={() => move(idx, 1)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
              title="Baixar prioridade"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
          </div>

          {/* name + repo */}
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => onSelect(site.id)}
          >
            <p className="truncate text-sm font-medium">{site.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {site.sourceRepo}
            </p>
          </button>

          {/* status chip */}
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              site.status === "queued"
                ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {site.status === "queued" ? "na fila" : "rascunho"}
          </span>

          {/* enqueue button (only for drafts) */}
          {site.status === "draft" && (
            <button
              type="button"
              disabled={busy === site.id}
              onClick={() => enqueue(site.id)}
              title="Iniciar migração"
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy === site.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Iniciar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error, refresh } = usePollingTool<DashboardData>(
    "TANSTACK_MIGRATOR_DASHBOARD",
    {},
    8000,
  );
  const [tab, setTab] = useState<Tab>("backlog");
  const [showRegister, setShowRegister] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const buckets = useMemo(() => {
    const result: Record<Tab, SiteView[]> = {
      backlog: [],
      migrating: [],
      needs_human: [],
      done: [],
    };
    for (const site of data?.sites ?? []) {
      result[bucketOf(site)].push(site);
    }
    // backlog: sorted by queue_position, then created_at
    result.backlog.sort((a, b) => {
      const pa = a.queuePosition ?? 9999;
      const pb = b.queuePosition ?? 9999;
      if (pa !== pb) return pa - pb;
      return a.createdAt.localeCompare(b.createdAt);
    });
    result.done.sort((a, b) =>
      (b.finishedAt ?? b.updatedAt).localeCompare(a.finishedAt ?? a.updatedAt),
    );
    return result;
  }, [data]);

  const totalCost = useMemo(
    () => (data?.sites ?? []).reduce((sum, s) => sum + (s.costTotal ?? 0), 0),
    [data],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold">TanStack Migrator</h1>
          {data && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {data.queue.active}/{data.queue.maxConcurrent} slots ·{" "}
              {data.queue.queued} na fila
              {data.queue.provider === "manual" ? " · simulação" : ""}
              {totalCost > 0 && ` · $${totalCost.toFixed(2)}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              atualizado às {clockTime(data.updatedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted"
            title="Atualizar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowRegister(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Cadastrar site
          </button>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-border px-4 pt-2">
        {TAB_META.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-medium",
              tab === t.id
                ? "border border-b-0 border-border bg-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
              {buckets[t.id].length}
            </span>
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && !data && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !data && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm">
            {error}
          </div>
        )}

        {data && tab === "backlog" && (
          <BacklogList
            sites={buckets.backlog}
            onRefresh={refresh}
            onSelect={setSelectedSiteId}
          />
        )}

        {data && tab !== "backlog" && buckets[tab].length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            {tab === "migrating" ? (
              <>
                <p>Nenhuma migração em andamento.</p>
                <button
                  type="button"
                  onClick={() => setShowRegister(true)}
                  className="text-primary-foreground rounded-md bg-primary px-3 py-1.5 text-xs font-semibold"
                >
                  Cadastrar o primeiro site
                </button>
              </>
            ) : tab === "needs_human" ? (
              <p>Nada esperando humano. 🙌</p>
            ) : (
              <p>Nenhum site 100% TanStack ainda.</p>
            )}
          </div>
        )}

        {data && tab !== "backlog" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {buckets[tab].map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                simulation={data?.queue.provider === "manual"}
                onClick={() => setSelectedSiteId(site.id)}
              />
            ))}
          </div>
        )}
      </main>

      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onRegistered={refresh}
        />
      )}
      {selectedSiteId && (
        <SiteDetailPanel
          siteId={selectedSiteId}
          simulation={data?.queue.provider === "manual"}
          onClose={() => setSelectedSiteId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
