import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/page-header.tsx";
import { StatusFrame } from "@/components/status-frame.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";

interface Variation {
  name?: string;
  visitors?: number;
  conversions?: number;
}

interface AbTest {
  id: string;
  name?: string;
  status?: string;
  variations?: Variation[];
}

interface ListAbTestsOutput {
  abTests: AbTest[];
  total: number;
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];

function ConversionChart({ variations }: { variations: Variation[] }) {
  const data = variations.map((v, i) => {
    const visitors = v.visitors ?? 0;
    const conversions = v.conversions ?? 0;
    const rate = visitors > 0 ? (conversions / visitors) * 100 : 0;
    return {
      name: v.name ?? `Variant ${i + 1}`,
      rate: Number(rate.toFixed(2)),
      conversions,
      visitors,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => `${v}%`}
          domain={[0, "auto"]}
        />
        <Tooltip
          formatter={(value: number, name) =>
            name === "rate" ? [`${value}%`, "Conversion"] : value
          }
        />
        <Bar dataKey="rate" radius={[6, 6, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function AbTestsPage() {
  const state = useMcpState<Record<string, never>, ListAbTestsOutput>();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage="Loading A/B tests…"
        connectedTitle="A/B Tests"
        connectedHint="Call crazy_egg_list_ab_tests."
      />
    );
  }

  const { abTests, total } = state.toolResult ?? { abTests: [], total: 0 };

  if (abTests.length === 0) {
    return (
      <div className="p-6">
        <PageHeader title="A/B Tests" subtitle="No tests found." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader title="A/B Tests" subtitle={`${total} test(s)`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {abTests.map((test) => (
          <Card key={test.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {test.name ?? test.id}
                  </CardTitle>
                  {test.status ? (
                    <Badge
                      variant={
                        test.status === "running" ? "default" : "secondary"
                      }
                      className="mt-1 capitalize"
                    >
                      {test.status}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {test.variations && test.variations.length > 0 ? (
                <ConversionChart variations={test.variations} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No variation data.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
