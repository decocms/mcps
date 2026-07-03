import { Ban } from "lucide-react";
import { StatusFrame } from "@/components/status-frame.tsx";
import { MAGENTO_ACCENT, MAGENTO_ICON } from "@/constants.ts";
import { useMcpState } from "@/context.tsx";
import { useTool } from "@/hooks/use-tool.ts";

const TOOL_NAME = "MAGENTO_CANCELLATION_RATE";

type ReportPeriod = "today" | "7d" | "30d";

interface CancellationRateInput {
  period?: ReportPeriod;
}

interface CancellationRateOutput {
  period: ReportPeriod;
  canceled: number;
  total: number;
  rate: number;
  startDate: string;
  endDate: string;
}

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

function fmt(n: number | undefined) {
  return new Intl.NumberFormat("pt-BR").format(n ?? 0);
}

function fmtPercent(rate: number | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(rate ?? 0);
}

export default function CancellationRatePage() {
  const { toolInput } = useMcpState<
    CancellationRateInput,
    CancellationRateOutput
  >();
  const args: Record<string, unknown> = toolInput?.period
    ? { period: toolInput.period }
    : {};
  const { data, loading, error } = useTool<CancellationRateOutput>(
    TOOL_NAME,
    args,
  );

  if (error) {
    return <StatusFrame status="error" error={error} />;
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-card">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Waiting for Magento response…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="@container box-border flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden bg-card p-3">
      <div className="flex items-center gap-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md sm:h-12 sm:w-12"
          style={{
            backgroundColor: `${MAGENTO_ACCENT}33`,
            color: MAGENTO_ICON,
          }}
        >
          <Ban className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            Taxa de cancelamento · {PERIOD_LABELS[data.period]}
          </p>
          <p className="text-2xl font-semibold tabular-nums @sm:text-3xl">
            {fmtPercent(data.rate)}
          </p>
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            {fmt(data.canceled)} cancelados de {fmt(data.total)} pedidos
          </p>
        </div>
      </div>
    </div>
  );
}
