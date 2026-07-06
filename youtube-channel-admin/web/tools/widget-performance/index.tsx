import { Loader2, UserPlus, UserMinus } from "lucide-react";
import { Sparkline } from "@/components/sparkline.tsx";
import { usePollingTool } from "@/hooks/use-tool.ts";
import { formatCount, formatWatchHours } from "@/lib/utils.ts";
import type { PerformanceWidgetData } from "@/types.ts";

const POLL_MS = 300_000;

export default function WidgetPerformancePage() {
  const { data, loading, error } = usePollingTool<PerformanceWidgetData>(
    "YOUTUBE_ADMIN_WIDGET_PERFORMANCE",
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
  if (!data) return null;

  const { performance, channel } = data;
  const { totals } = performance;
  const netSubs = totals.subscribersGained - totals.subscribersLost;

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex items-center gap-2">
        {channel.thumbnailUrl && (
          <img
            src={channel.thumbnailUrl}
            alt=""
            className="h-6 w-6 shrink-0 rounded-full"
          />
        )}
        <span className="truncate text-sm font-semibold" title={channel.title}>
          {channel.title}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
          {formatCount(channel.subscriberCount)} inscritos
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-base font-semibold tabular-nums leading-tight">
            {formatCount(totals.views)}
          </p>
          <p className="text-[10px] text-muted-foreground">views</p>
        </div>
        <div>
          <p className="text-base font-semibold tabular-nums leading-tight">
            {formatWatchHours(totals.watchMinutes)}
          </p>
          <p className="text-[10px] text-muted-foreground">assistidas</p>
        </div>
        <div>
          <p className="text-base font-semibold tabular-nums leading-tight">
            {netSubs >= 0 ? `+${formatCount(netSubs)}` : formatCount(netSubs)}
          </p>
          <p className="text-[10px] text-muted-foreground">inscritos</p>
        </div>
      </div>

      <Sparkline
        points={performance.daily.map((day) => day.views)}
        className="text-primary"
      />

      <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>últimos 28 dias</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-0.5">
            <UserPlus className="h-3 w-3" />
            {formatCount(totals.subscribersGained)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <UserMinus className="h-3 w-3" />
            {formatCount(totals.subscribersLost)}
          </span>
        </span>
      </div>
    </div>
  );
}
