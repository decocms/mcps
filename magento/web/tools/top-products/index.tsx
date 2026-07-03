import { Trophy } from "lucide-react";
import { StatusFrame } from "@/components/status-frame.tsx";
import { MAGENTO_ACCENT } from "@/constants.ts";
import { useMcpState } from "@/context.tsx";
import { useTool } from "@/hooks/use-tool.ts";

const TOOL_NAME = "MAGENTO_TOP_PRODUCTS";

type ReportPeriod = "today" | "7d" | "30d";

interface TopProduct {
  sku: string;
  name: string;
  quantity: number;
  revenue: number;
  orders: number;
}

interface TopProductsInput {
  period?: ReportPeriod;
  limit?: number;
}

interface TopProductsOutput {
  products: TopProduct[];
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

function fmtCurrency(value: number | undefined, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export default function TopProductsPage() {
  const { toolInput } = useMcpState<TopProductsInput, TopProductsOutput>();
  const args: Record<string, unknown> = {
    ...(toolInput?.period ? { period: toolInput.period } : {}),
    ...(toolInput?.limit ? { limit: toolInput.limit } : {}),
  };
  const { data, loading, error } = useTool<TopProductsOutput>(TOOL_NAME, args);

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

  const products = data.products ?? [];
  const currency = data.currency || "BRL";
  const maxQuantity = Math.max(1, ...products.map((p) => p.quantity));

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-card px-2 pt-2 pb-1">
      <p className="mb-3 shrink-0 text-base flex items-center gap-2">
        <Trophy className="w-4 h-4" />
        Top produtos · {PERIOD_LABELS[data.period]}
      </p>
      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum pedido no período.
        </p>
      ) : (
        <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {products.map((product, index) => (
            <li key={product.sku} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {index + 1}.
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm" title={product.name}>
                    {product.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {fmt(product.quantity)} un ·{" "}
                    {fmtCurrency(product.revenue, currency)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${Math.max(4, (product.quantity / maxQuantity) * 100)}%`,
                      backgroundColor: MAGENTO_ACCENT,
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
