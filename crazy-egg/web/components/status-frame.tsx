import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import type { McpStatus } from "../types.ts";

interface StatusFrameProps {
  status: McpStatus;
  error?: string;
  pendingMessage?: string;
  connectedTitle?: string;
  connectedHint?: string;
}

export function StatusFrame({
  status,
  error,
  pendingMessage = "Loading…",
  connectedTitle = "Crazy Egg Dashboard",
  connectedHint = "Invoke a tool to see analytics here.",
}: StatusFrameProps) {
  if (status === "initializing") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Connecting to host…</span>
        </div>
      </div>
    );
  }

  if (status === "connected") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>{connectedTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{connectedHint}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive whitespace-pre-wrap break-words">
              {error ?? "Unknown error"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "tool-cancelled") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Cancelled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">Tool call was cancelled.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // tool-input
  return (
    <div className="flex items-center justify-center min-h-dvh p-6">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
        <span className="text-sm">{pendingMessage}</span>
      </div>
    </div>
  );
}
