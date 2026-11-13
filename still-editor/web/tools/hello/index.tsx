import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpApp, useMcpState } from "@/context.tsx";
import type { HelloInput, HelloOutput } from "../../../api/tools/hello.ts";

export default function HelloPage() {
  const state = useMcpState<HelloInput, HelloOutput>();
  const app = useMcpApp();

  if (state.status === "initializing") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Connecting to host...</span>
        </div>
      </div>
    );
  }

  if (state.status === "connected") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Hello MCP App</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Connected. Call the <Badge variant="secondary">hello_world</Badge>{" "}
              tool to see a greeting here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">
              {state.error ?? "Unknown error"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === "tool-cancelled") {
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

  if (state.status === "tool-input") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">
            Greeting {state.toolInput?.name ?? "someone"}...
          </span>
        </div>
      </div>
    );
  }

  // tool-result
  return (
    <div className="flex items-center justify-center min-h-dvh p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">
            {state.toolResult?.greeting}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.toolResult?.timestamp ? (
            <p className="text-xs text-muted-foreground">
              {new Date(state.toolResult.timestamp).toLocaleString()}
            </p>
          ) : null}
          <Button
            onClick={() => {
              const name = state.toolInput?.name ?? "there";
              app?.sendMessage({
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Please greet ${name} warmly and tell them a little about yourself — who you are, what you can help with, and something interesting about how you work.`,
                  },
                ],
              });
            }}
          >
            Send Message
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
