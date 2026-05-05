import { Eye, MousePointerClick, Percent } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

interface SnapshotTraffic {
  id: string;
  name?: string;
  visits: number;
  clicks: number;
  clickThroughRate: number;
}

interface TrafficOutput {
  totalVisits: number;
  totalClicks: number;
  overallCTR: number;
  bySnapshot: SnapshotTraffic[];
}

function fmt(n: number) {
  return new Intl.NumberFormat().format(n);
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TrafficPage() {
  const state = useMcpState<Record<string, never>, TrafficOutput>();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage="Aggregating traffic…"
        connectedTitle="Traffic"
        connectedHint="Call crazy_egg_get_traffic."
      />
    );
  }

  const { totalVisits, totalClicks, overallCTR, bySnapshot } =
    state.toolResult ?? {
      totalVisits: 0,
      totalClicks: 0,
      overallCTR: 0,
      bySnapshot: [],
    };

  const data = bySnapshot.map((s) => ({
    name: s.name ?? s.id,
    visits: s.visits,
    clicks: s.clicks,
  }));

  return (
    <div className="p-6">
      <PageHeader
        title="Traffic Overview"
        subtitle={`Aggregated across ${bySnapshot.length} snapshot(s)`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<Eye className="w-5 h-5" />}
          label="Total visits"
          value={fmt(totalVisits)}
        />
        <StatCard
          icon={<MousePointerClick className="w-5 h-5" />}
          label="Total clicks"
          value={fmt(totalClicks)}
        />
        <StatCard
          icon={<Percent className="w-5 h-5" />}
          label="Overall CTR"
          value={`${(overallCTR * 100).toFixed(2)}%`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Visits & clicks per snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No snapshot data available.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={data}
                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="visits"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
