import { Loader2, Radio } from "lucide-react";
import { usePollingTool } from "@/hooks/use-tool.ts";

const POLL_MS = 60_000; // 1min — live status changes quickly

interface BroadcastEntry {
  broadcastId: string;
  title: string;
  lifeCycleStatus: string;
  scheduledStartTime?: string;
  actualStartTime?: string;
  thumbnailUrl?: string;
  watchUrl: string;
}

interface LivesWidgetData {
  broadcasts: BroadcastEntry[];
  hasActiveBroadcast: boolean;
  updatedAt: string;
}

function formatScheduled(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "live") {
    return (
      <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        Ao vivo
      </span>
    );
  }
  if (status === "testing") {
    return (
      <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        Teste
      </span>
    );
  }
  return null;
}

export default function WidgetLivesPage() {
  const { data, loading, error } = usePollingTool<LivesWidgetData>(
    "YOUTUBE_ADMIN_WIDGET_LIVES",
    {},
    POLL_MS,
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

  const broadcasts = data?.broadcasts ?? [];

  if (broadcasts.length === 0) {
    return (
      <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-1 p-4 text-center">
        <Radio className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          Nenhuma live ou estreia agendada.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-2">
      <p className="px-1.5 text-[11px] text-muted-foreground">
        Lives & Estreias
      </p>
      {broadcasts.map((bc) => (
        <a
          key={bc.broadcastId}
          href={bc.watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors"
        >
          {bc.thumbnailUrl && (
            <img
              src={bc.thumbnailUrl}
              alt=""
              className="h-8 w-14 flex-shrink-0 rounded object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium leading-tight">
              {bc.title}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {bc.lifeCycleStatus === "live" || bc.lifeCycleStatus === "testing"
                ? null
                : formatScheduled(bc.scheduledStartTime ?? bc.actualStartTime)}
            </p>
          </div>
          <StatusBadge status={bc.lifeCycleStatus} />
        </a>
      ))}
    </div>
  );
}
