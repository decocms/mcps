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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";

interface Stage {
  name?: string;
  visitors?: number;
}

interface Funnel {
  id: string;
  name?: string;
  stages?: Stage[];
}

interface ListFunnelsOutput {
  funnels: Funnel[];
  total: number;
}

const COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
];

function FunnelChart({ stages }: { stages: Stage[] }) {
  const data = stages.map((s, i) => {
    const visitors = s.visitors ?? 0;
    const top = stages[0]?.visitors ?? 0;
    const dropOff = top > 0 ? ((1 - visitors / top) * 100).toFixed(1) : "0";
    return {
      name: s.name ?? `Stage ${i + 1}`,
      visitors,
      dropOff: `${dropOff}%`,
    };
  });

  return (
    <ResponsiveContainer
      width="100%"
      height={Math.max(120, stages.length * 50)}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12 }}
          width={120}
        />
        <Tooltip
          formatter={(value: number) => [
            new Intl.NumberFormat().format(value),
            "Visitors",
          ]}
        />
        <Bar dataKey="visitors" radius={[0, 6, 6, 0]}>
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function FunnelsPage() {
  const state = useMcpState<Record<string, never>, ListFunnelsOutput>();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage="Loading funnels…"
        connectedTitle="Funnels"
        connectedHint="Call crazy_egg_list_funnels."
      />
    );
  }

  const { funnels, total } = state.toolResult ?? { funnels: [], total: 0 };

  if (funnels.length === 0) {
    return (
      <div className="p-6">
        <PageHeader title="Funnels" subtitle="No funnels configured." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader title="Funnels" subtitle={`${total} funnel(s)`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {funnels.map((f) => (
          <Card key={f.id}>
            <CardHeader>
              <CardTitle className="text-base">{f.name ?? f.id}</CardTitle>
            </CardHeader>
            <CardContent>
              {f.stages && f.stages.length > 0 ? (
                <FunnelChart stages={f.stages} />
              ) : (
                <p className="text-sm text-muted-foreground">No stage data.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
