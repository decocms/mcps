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
import { MAGENTO_ACCENT } from "@/constants.ts";
import { useTool } from "@/hooks/use-tool.ts";

const TOOL_NAME = "MAGENTO_ORDERS_TIMELINE";

interface HourBucket {
  hour: string;
  count: number;
  totalValue: number;
}

interface OrdersTimelineOutput {
  hours: HourBucket[];
  date: string;
  currency: string;
  truncated: boolean;
}

function fmt(n: number | undefined) {
  return new Intl.NumberFormat("pt-BR").format(n ?? 0);
}

export default function OrdersTimelinePage() {
  const { data, loading, error } = useTool<
    OrdersTimelineOutput,
    Record<string, never>
  >(TOOL_NAME, {});

  if (error) {
    return <StatusFrame status="error" error={error} />;
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Waiting for Magento response…</span>
        </div>
      </div>
    );
  }

  const { hours } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pt-2 pb-1">
      <p className="mb-3 shrink-0 text-base flex items-center gap-2">
        <DollarSign className="w-4 h-4" />
        Pedidos por hora
      </p>
      {data.truncated ? (
        <p className="mb-2 shrink-0 text-[11px] text-muted-foreground">
          Dados parciais — o volume de pedidos excedeu o limite de paginação.
        </p>
      ) : null}
      {hours.every((bucket) => bucket.count === 0) ? (
        <p className="text-sm text-muted-foreground">
          Nenhum pedido encontrado hoje.
        </p>
      ) : (
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={hours}
              margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={1} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(value: number) => [fmt(value), "Pedidos"]} />
              <Bar
                dataKey="count"
                fill={MAGENTO_ACCENT}
                radius={[4, 4, 0, 0]}
                name="count"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
