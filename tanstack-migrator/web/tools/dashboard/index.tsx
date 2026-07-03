import { Loader2, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { RegisterModal } from "@/components/register-modal.tsx";
import { SiteCard } from "@/components/site-card.tsx";
import { SiteDetailPanel } from "@/components/site-detail.tsx";
import { usePollingTool } from "@/hooks/use-tool.ts";
import { cn } from "@/lib/utils.ts";
import type { DashboardData, SiteView } from "@/types.ts";

type Tab = "migrating" | "needs_human" | "done";

const TAB_META: Array<{ id: Tab; label: string }> = [
  { id: "migrating", label: "Em migração" },
  { id: "needs_human", label: "Precisa de humano" },
  { id: "done", label: "100% TanStack" },
];

function bucketOf(site: SiteView): Tab {
  if (site.status === "done") return "done";
  if (site.status === "needs_human" || site.status === "failed") {
    return "needs_human";
  }
  return "migrating";
}

export default function DashboardPage() {
  const { data, loading, error, refresh } = usePollingTool<DashboardData>(
    "TANSTACK_MIGRATOR_DASHBOARD",
    {},
    8000,
  );
  const [tab, setTab] = useState<Tab>("migrating");
  const [showRegister, setShowRegister] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  const buckets = useMemo(() => {
    const result: Record<Tab, SiteView[]> = {
      migrating: [],
      needs_human: [],
      done: [],
    };
    for (const site of data?.sites ?? []) {
      result[bucketOf(site)].push(site);
    }
    result.done.sort((a, b) =>
      (b.finishedAt ?? b.updatedAt).localeCompare(a.finishedAt ?? a.updatedAt),
    );
    return result;
  }, [data]);

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
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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

        {data && buckets[tab].length === 0 && (
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
