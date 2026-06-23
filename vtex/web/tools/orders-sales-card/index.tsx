import { Clock, Timer, TrendingUp } from "lucide-react";
import { StatusFrame } from "@/components/status-frame.tsx";
import { useMcpState } from "@/context.tsx";
import { useTool } from "@/hooks/use-tool.ts";
import { cn } from "@/lib/utils.ts";

const TOOL_NAME = "VTEX_ORDERS_SALES_CARD";

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

function SalesCardItem({ card }: { card: SalesCard }) {
  const { period, orders, totalValue, date } = card;
  const ordersLine =
    period === "today" && date
      ? `${fmt(orders)} pedidos · ${date}`
      : `${fmt(orders)} pedidos`;

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-col rounded-xl border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex h-full min-h-0 flex-1 items-center gap-3">
        <div className="flex shrink-0 items-center justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-10 sm:w-10">
            {PERIOD_ICONS[period]}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-0.5">
          <p className="text-[11px] text-muted-foreground sm:text-xs">
            {PERIOD_LABELS[period]}
          </p>
          <p className="text-base font-semibold tabular-nums truncate @sm:text-lg @md:text-xl">
            {fmtCurrency(totalValue)}
          </p>
          <p className="text-[11px] text-muted-foreground line-clamp-2 sm:text-xs">
            {ordersLine}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OrdersSalesCardPage() {
  const { toolInput } = useMcpState<SalesCardInput, SalesCardOutput>();
  const args: Record<string, unknown> = toolInput?.period
    ? { period: toolInput.period }
    : {};
  const { data, loading, error } = useTool<SalesCardOutput>(TOOL_NAME, args);

  if (error) {
    return <StatusFrame status="error" error={error} />;
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Waiting for VTEX response…</span>
        </div>
      </div>
    );
  }

  const cards = sortCards(data.cards ?? []);
  const equalSize = cards.length === 3;

  return (
    <div className="box-border flex min-h-0 w-full flex-1 flex-col overflow-hidden p-2">
      <div
        className={cn(
          "min-h-0 w-full flex-1 gap-2",
          equalSize
            ? "grid grid-cols-3 grid-rows-[minmax(0,1fr)]"
            : "flex min-h-0 flex-row",
        )}
      >
        {cards.map((card) => (
          <div
            key={card.period}
            className={cn(
              "flex min-h-0 min-w-0 flex-col",
              equalSize ? "h-full" : "flex-1",
            )}
          >
            <SalesCardItem card={card} />
          </div>
        ))}
      </div>
    </div>
  );
}
