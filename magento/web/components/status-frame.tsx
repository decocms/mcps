import type { ReactNode } from "react";
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

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-dvh p-6">
      {children}
    </div>
  );
}

function Spinner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function StatusFrame({
  status,
  error,
  pendingMessage = "Loading…",
  connectedTitle = "Magento Dashboard",
  connectedHint = "Invoke a tool to see analytics here.",
}: StatusFrameProps) {
  if (status === "initializing") {
    return (
      <Centered>
        <Spinner message="Connecting to host…" />
      </Centered>
    );
  }

  if (status === "connected") {
    return (
      <Centered>
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>{connectedTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{connectedHint}</p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (status === "error") {
    return (
      <Centered>
        <Card role="alert" className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive whitespace-pre-wrap break-words">
              {error ?? "Unknown error"}
            </p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (status === "tool-cancelled") {
    return (
      <Centered>
        <Card role="alert" className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Cancelled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">Tool call was cancelled.</p>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  return (
    <Centered>
      <Spinner message={pendingMessage} />
    </Centered>
  );
}
