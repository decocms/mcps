import { Clock, DollarSign, Timer, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/page-header.tsx";
import { StatusFrame } from "@/components/status-frame.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";

interface HourBucket {
  hour: string;
  count: number;
  totalValue: number;
}

interface PeriodStats {
  orders: number;
  totalValue: number;
}

interface OrdersTimelineOutput {
  hours: HourBucket[];
  today: PeriodStats;
  lastHour: PeriodStats;
  last5Minutes: PeriodStats;
  date: string;
}

function fmt(n: number | undefined) {
  return new Intl.NumberFormat("pt-BR").format(n ?? 0);
}

function fmtCurrency(cents: number | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((cents ?? 0) / 100);
}

function resolvePeriodStats(
  period: PeriodStats | undefined,
  fallbackOrders: number,
  fallbackValue: number,
): PeriodStats {
  return {
    orders: period?.orders ?? fallbackOrders,
    totalValue: period?.totalValue ?? fallbackValue,
  };
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums truncate">{value}</p>
          {subtitle ? (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrdersTimelinePage() {
  const state = useMcpState<Record<string, never>, OrdersTimelineOutput>();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage="Carregando vendas…"
        connectedTitle="Orders Timeline"
        connectedHint="Chame VTEX_ORDERS_TIMELINE."
      />
    );
  }

  const { hours, today, lastHour, last5Minutes, date } = state.toolResult ?? {
    hours: [],
    today: { orders: 0, totalValue: 0 },
    lastHour: { orders: 0, totalValue: 0 },
    last5Minutes: { orders: 0, totalValue: 0 },
    date: "",
  };

  const ordersFromHours = hours.reduce((sum, bucket) => sum + bucket.count, 0);
  const valueFromHours = hours.reduce(
    (sum, bucket) => sum + bucket.totalValue,
    0,
  );

  const todayStats = resolvePeriodStats(today, ordersFromHours, valueFromHours);
  const lastHourStats = resolvePeriodStats(lastHour, 0, 0);
  const last5MinStats = resolvePeriodStats(last5Minutes, 0, 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Orders Timeline"
        subtitle={`Vendas de hoje (${date}, UTC) por hora`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Vendas hoje"
          value={fmtCurrency(todayStats.totalValue)}
          subtitle={`${fmt(todayStats.orders)} pedidos`}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Última 1h"
          value={fmtCurrency(lastHourStats.totalValue)}
          subtitle={`${fmt(lastHourStats.orders)} pedidos`}
        />
        <StatCard
          icon={<Timer className="w-5 h-5" />}
          label="Últimos 5 min"
          value={fmtCurrency(last5MinStats.totalValue)}
          subtitle={`${fmt(last5MinStats.orders)} pedidos`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Pedidos por hora
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hours.every((bucket) => bucket.count === 0) ? (
            <p className="text-sm text-muted-foreground">
              Nenhum pedido encontrado hoje.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={hours}
                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={1} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === "count") return [fmt(value), "Pedidos"];
                    return [fmtCurrency(value), "Vendas"];
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                  name="count"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
