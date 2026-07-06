import { CheckCircle2, Loader2 } from "lucide-react";
import { AlertRow } from "@/components/alert-row.tsx";
import { usePollingTool } from "@/hooks/use-tool.ts";
import type { AlertsWidgetData } from "@/types.ts";

const POLL_MS = 300_000;

export default function WidgetAlertsPage() {
  const { data, loading, error } = usePollingTool<AlertsWidgetData>(
    "YOUTUBE_ADMIN_WIDGET_ALERTS",
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

  const alerts = data?.alerts ?? [];

  if (alerts.length === 0) {
    return (
      <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-1 p-4 text-center">
        <CheckCircle2 className="h-5 w-5 text-primary" />
        <p className="text-xs text-muted-foreground">
          Tudo certo — nenhum vídeo com problema.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <p className="px-1.5 text-[11px] text-muted-foreground">
        Alertas do canal
      </p>
      {alerts.slice(0, 8).map((alert, index) => (
        <AlertRow
          key={`${alert.kind}-${alert.videoId ?? index}`}
          alert={alert}
        />
      ))}
      {alerts.length > 8 && (
        <p className="px-1.5 text-[11px] text-muted-foreground">
          +{alerts.length - 8} outros alertas
        </p>
      )}
    </div>
  );
}
