import { DollarSign } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatusFrame } from "@/components/status-frame.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";

const DECO_CHART_COLOR = "#d0ec1a";

interface HourBucket {
  hour: string;
  count: number;
  totalValue: number;
}

interface OrdersTimelineOutput {
  hours: HourBucket[];
  date: string;
}

function fmt(n: number | undefined) {
  return new Intl.NumberFormat("pt-BR").format(n ?? 0);
}

export default function OrdersTimelinePage() {
  const state = useMcpState<Record<string, never>, OrdersTimelineOutput>();

  if (state.status === "error" || state.status === "tool-cancelled") {
    return <StatusFrame status={state.status} error={state.error} />;
  }

  if (state.status !== "tool-result") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Carregando timeline…</span>
        </div>
      </div>
    );
  }

  const { hours } = state.toolResult ?? { hours: [], date: "" };

  return (
    <div className="p-6">
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
                  formatter={(value: number) => [fmt(value), "Pedidos"]}
                />
                <Bar
                  dataKey="count"
                  fill={DECO_CHART_COLOR}
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
