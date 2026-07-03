import { ChartPie } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { StatusFrame } from "@/components/status-frame.tsx";
import { MAGENTO_CHART_COLORS } from "@/constants.ts";
import { useMcpState } from "@/context.tsx";
import { useTool } from "@/hooks/use-tool.ts";

const TOOL_NAME = "MAGENTO_STATUS_BREAKDOWN";

type ReportPeriod = "today" | "7d" | "30d";

interface StatusBucket {
  status: string;
  count: number;
  totalValue: number;
}

interface StatusBreakdownInput {
  period?: ReportPeriod;
}

interface StatusBreakdownOutput {
  statuses: StatusBucket[];
  total: number;
  period: ReportPeriod;
  currency: string;
  truncated: boolean;
}

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: "hoje",
  "7d": "últimos 7 dias",
  "30d": "últimos 30 dias",
};

function fmt(n: number | undefined) {
  return new Intl.NumberFormat("pt-BR").format(n ?? 0);
}

export default function StatusBreakdownPage() {
  const { toolInput } = useMcpState<
    StatusBreakdownInput,
    StatusBreakdownOutput
  >();
  const args: Record<string, unknown> = toolInput?.period
    ? { period: toolInput.period }
    : {};
  const { data, loading, error } = useTool<StatusBreakdownOutput>(
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

  const statuses = data.statuses ?? [];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-card px-2 pt-2 pb-1">
      <p className="mb-2 shrink-0 text-base flex items-center gap-2">
        <ChartPie className="w-4 h-4" />
        Pedidos por status · {PERIOD_LABELS[data.period]}
      </p>
      {data.truncated ? (
        <p className="mb-2 shrink-0 text-[11px] text-muted-foreground">
          Dados parciais — o volume de pedidos excedeu o limite de paginação.
        </p>
      ) : null}
      {statuses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum pedido no período.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 items-center gap-3">
          <div
            className="h-full min-h-0 flex-1"
            role="img"
            aria-label={`Gráfico de pizza da distribuição de ${fmt(data.total)} pedidos por status`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${fmt(value)} pedidos`,
                    name,
                  ]}
                />
                <Pie
                  data={statuses}
                  dataKey="count"
                  nameKey="status"
                  innerRadius="55%"
                  outerRadius="90%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {statuses.map((bucket, index) => (
                    <Cell
                      key={bucket.status}
                      fill={
                        MAGENTO_CHART_COLORS[
                          index % MAGENTO_CHART_COLORS.length
                        ]
                      }
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex max-h-full min-w-0 flex-col gap-1 overflow-y-auto pr-1">
            {statuses.map((bucket, index) => (
              <li
                key={bucket.status}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{
                    backgroundColor:
                      MAGENTO_CHART_COLORS[index % MAGENTO_CHART_COLORS.length],
                  }}
                />
                <span className="truncate">{bucket.status}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {fmt(bucket.count)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
