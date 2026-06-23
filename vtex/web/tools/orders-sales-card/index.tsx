import { Clock, Timer, TrendingUp } from "lucide-react";
import { StatusFrame } from "@/components/status-frame.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";

type SalesPeriod = "today" | "last_1h" | "last_5min";

interface SalesCard {
  period: SalesPeriod;
  orders: number;
  totalValue: number;
  date?: string;
}

interface SalesCardInput {
  period?: SalesPeriod;
}

interface SalesCardOutput {
  cards: SalesCard[];
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

const PERIOD_ORDER: SalesPeriod[] = ["today", "last_1h", "last_5min"];

function fmt(n: number | undefined) {
  return new Intl.NumberFormat("pt-BR").format(n ?? 0);
}

function fmtCurrency(cents: number | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((cents ?? 0) / 100);
}

function sortCards(cards: SalesCard[]): SalesCard[] {
  const byPeriod = new Map(cards.map((card) => [card.period, card]));
  return PERIOD_ORDER.flatMap((period) => {
    const card = byPeriod.get(period);
    return card ? [card] : [];
  });
}

function SalesCardItem({
  card,
  equalSize,
}: {
  card: SalesCard;
  equalSize: boolean;
}) {
  const { period, orders, totalValue, date } = card;
  const ordersLine =
    period === "today" && date
      ? `${fmt(orders)} pedidos · ${date}`
      : `${fmt(orders)} pedidos`;

  return (
    <Card
      className={
        equalSize
          ? "h-full min-w-0 gap-0 py-0 shadow-sm"
          : "min-w-0 flex-1 gap-0 py-0 shadow-sm"
      }
    >
      <CardContent className="h-full p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
          {PERIOD_ICONS[period]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {PERIOD_LABELS[period]}
          </p>
          <p className="text-xl font-semibold tabular-nums truncate">
            {fmtCurrency(totalValue)}
          </p>
          <p
            className={
              equalSize
                ? "text-xs text-muted-foreground mt-0.5 min-h-8 line-clamp-2"
                : "text-xs text-muted-foreground mt-0.5"
            }
          >
            {ordersLine}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrdersSalesCardPage() {
  const state = useMcpState<SalesCardInput, SalesCardOutput>();

  if (state.status === "error" || state.status === "tool-cancelled") {
    return <StatusFrame status={state.status} error={state.error} />;
  }

  if (state.status !== "tool-result") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Waiting for VTEX response…</span>
        </div>
      </div>
    );
  }

  const cards = sortCards(state.toolResult?.cards ?? []);
  const equalSize = cards.length === 3;

  return (
    <div className="p-4">
      <div
        className={
          equalSize
            ? "grid grid-cols-3 gap-3 items-stretch"
            : "flex flex-row gap-3 items-stretch"
        }
      >
        {cards.map((card) => (
          <SalesCardItem key={card.period} card={card} equalSize={equalSize} />
        ))}
      </div>
    </div>
  );
}
