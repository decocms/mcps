import { Eye, MousePointerClick } from "lucide-react";
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

interface Snapshot {
  id: string;
  name?: string;
  source_url?: string;
  thumbnail_url?: string;
  screenshot_url?: string;
  heatmap_url?: string;
  total_visits?: number;
  total_clicks?: number;
  status?: string;
}

interface ListSnapshotsOutput {
  snapshots: Snapshot[];
  total: number;
}

function formatNumber(n: number | undefined) {
  if (n === undefined) return "—";
  return new Intl.NumberFormat().format(n);
}

export default function SnapshotsPage() {
  const state = useMcpState<
    { limit?: number; status?: string },
    ListSnapshotsOutput
  >();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage="Loading snapshots…"
        connectedTitle="Snapshots"
        connectedHint="Call crazy_egg_list_snapshots to fetch heatmaps."
      />
    );
  }

  const { snapshots, total } = state.toolResult ?? { snapshots: [], total: 0 };

  if (snapshots.length === 0) {
    return (
      <div className="p-6">
        <PageHeader title="Snapshots" subtitle="No snapshots found." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Snapshots"
        subtitle={`Showing ${snapshots.length} of ${total} heatmaps`}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {snapshots.map((snap) => (
          <Card key={snap.id} className="overflow-hidden">
            {snap.thumbnail_url || snap.screenshot_url ? (
              <div className="aspect-video bg-muted overflow-hidden">
                <img
                  src={snap.thumbnail_url ?? snap.screenshot_url}
                  alt={snap.name ?? snap.source_url ?? snap.id}
                  className="w-full h-full object-cover object-top"
                  loading="lazy"
                />
              </div>
            ) : null}
            <CardHeader className="pb-2">
              <CardTitle className="text-base truncate">
                {snap.name ?? snap.source_url ?? snap.id}
              </CardTitle>
              {snap.source_url ? (
                <p className="text-xs text-muted-foreground truncate">
                  {snap.source_url}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Eye className="w-3.5 h-3.5" /> Visits
                </span>
                <span className="font-medium tabular-nums">
                  {formatNumber(snap.total_visits)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <MousePointerClick className="w-3.5 h-3.5" /> Clicks
                </span>
                <span className="font-medium tabular-nums">
                  {formatNumber(snap.total_clicks)}
                </span>
              </div>
              {snap.status ? (
                <Badge
                  variant={snap.status === "active" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {snap.status}
                </Badge>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
