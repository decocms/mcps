import { Clock, Timer, TrendingUp } from "lucide-react";
import { StatusFrame } from "@/components/status-frame.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";

type SalesPeriod = "today" | "last_1h" | "last_5min";

interface SalesCardInput {
  period: SalesPeriod;
}

interface SalesCardOutput {
  period: SalesPeriod;
  orders: number;
  totalValue: number;
  date?: string;
}

const PERIOD_LABELS: Record<SalesPeriod, string> = {
  today: "Vendas hoje",
  last_1h: "Última 1h",
  last_5min: "Últimos 5 min",
};

const PERIOD_ICONS: Record<SalesPeriod, React.ReactNode> = {
  today: <TrendingUp className="w-5 h-5" />,
  last_1h: <Clock className="w-5 h-5" />,
  last_5min: <Timer className="w-5 h-5" />,
};

function fmt(n: number | undefined) {
  return new Intl.NumberFormat("pt-BR").format(n ?? 0);
}

function fmtCurrency(cents: number | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((cents ?? 0) / 100);
}

export default function OrdersSalesCardPage() {
  const state = useMcpState<SalesCardInput, SalesCardOutput>();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage="Carregando vendas…"
        connectedTitle="Sales Card"
        connectedHint='Chame VTEX_ORDERS_SALES_CARD com period: "today", "last_1h" ou "last_5min".'
      />
    );
  }

  const period = state.toolResult?.period ?? state.toolInput?.period ?? "today";
  const orders = state.toolResult?.orders ?? 0;
  const totalValue = state.toolResult?.totalValue ?? 0;
  const date = state.toolResult?.date;

  return (
    <div className="p-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
            {PERIOD_ICONS[period]}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {PERIOD_LABELS[period]}
            </p>
            <p className="text-xl font-semibold tabular-nums truncate">
              {fmtCurrency(totalValue)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmt(orders)} pedidos
              {period === "today" && date ? ` · ${date}` : ""}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
