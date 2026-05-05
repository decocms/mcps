import { ExternalLink, Eye, Flame, MousePointerClick } from "lucide-react";
import { PageHeader } from "@/components/page-header.tsx";
import { StatusFrame } from "@/components/status-frame.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
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
  screenshot_url?: string;
  heatmap_url?: string;
  thumbnail_url?: string;
  total_visits?: number;
  total_clicks?: number;
  status?: string;
}

interface GetSnapshotOutput {
  snapshot: Snapshot;
}

function fmt(n: number | undefined) {
  return n === undefined ? "—" : new Intl.NumberFormat().format(n);
}

export default function SnapshotDetailPage() {
  const state = useMcpState<{ snapshotId: string }, GetSnapshotOutput>();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage={`Loading snapshot ${state.toolInput?.snapshotId ?? ""}…`}
        connectedTitle="Snapshot Detail"
        connectedHint="Call crazy_egg_get_snapshot with a snapshotId."
      />
    );
  }

  const snap = state.toolResult?.snapshot;
  if (!snap) {
    return (
      <div className="p-6">
        <PageHeader title="Snapshot not found" />
      </div>
    );
  }

  const ctr =
    snap.total_visits && snap.total_visits > 0 && snap.total_clicks
      ? ((snap.total_clicks / snap.total_visits) * 100).toFixed(2)
      : null;

  return (
    <div className="p-6">
      <PageHeader
        title={snap.name ?? snap.id}
        subtitle={snap.source_url}
        right={
          snap.source_url ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={snap.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" /> Open page
              </a>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="w-4 h-4" /> Heatmap
            </CardTitle>
          </CardHeader>
          <CardContent>
            {snap.heatmap_url ? (
              <img
                src={snap.heatmap_url}
                alt={`Heatmap for ${snap.name ?? snap.id}`}
                className="w-full rounded-md border"
              />
            ) : snap.screenshot_url ? (
              <img
                src={snap.screenshot_url}
                alt={`Screenshot for ${snap.name ?? snap.id}`}
                className="w-full rounded-md border"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No heatmap or screenshot available.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Stat
                icon={<Eye className="w-4 h-4" />}
                label="Visits"
                value={fmt(snap.total_visits)}
              />
              <Stat
                icon={<MousePointerClick className="w-4 h-4" />}
                label="Clicks"
                value={fmt(snap.total_clicks)}
              />
              {ctr !== null ? (
                <Stat label="Click-through rate" value={`${ctr}%`} />
              ) : null}
              {snap.status ? (
                <div className="pt-2 border-t">
                  <Badge
                    variant={snap.status === "active" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {snap.status}
                  </Badge>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
