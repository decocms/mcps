import { CheckCircle2, XCircle } from "lucide-react";
import { StatusFrame } from "@/components/status-frame.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";

interface TrackInput {
  goalName?: string;
  userIdentifier?: string;
  value?: number;
  currency?: string;
}

interface TrackOutput {
  success?: boolean;
  processed?: number;
}

export default function TrackConversionPage() {
  const state = useMcpState<TrackInput, TrackOutput>();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage={`Tracking conversion for ${state.toolInput?.userIdentifier ?? "user"}…`}
        connectedTitle="Track Conversion"
        connectedHint="Call crazy_egg_track_conversion to log a goal conversion."
      />
    );
  }

  const ok = state.toolResult?.success !== false;

  return (
    <div className="flex items-center justify-center min-h-dvh p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="flex-row items-center gap-3">
          {ok ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          ) : (
            <XCircle className="w-6 h-6 text-destructive" />
          )}
          <CardTitle>{ok ? "Conversion Tracked" : "Tracking Failed"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Goal</span>
            <Badge variant="secondary">
              {state.toolInput?.goalName ?? "—"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">User</span>
            <code className="text-xs">
              {state.toolInput?.userIdentifier ?? "—"}
            </code>
          </div>
          {state.toolInput?.value !== undefined ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Value</span>
              <span className="font-medium tabular-nums">
                {state.toolInput.currency ?? ""} {state.toolInput.value}
              </span>
            </div>
          ) : null}
          {state.toolResult?.processed !== undefined ? (
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">Processed</span>
              <span className="font-medium tabular-nums">
                {state.toolResult.processed}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
