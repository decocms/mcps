import { CheckCircle2, XCircle } from "lucide-react";
import { StatusFrame } from "@/components/status-frame.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { useMcpState } from "@/context.tsx";

interface VerifyOutput {
  authenticated: boolean;
  error?: string;
}

export default function VerifyCredentialsPage() {
  const state = useMcpState<Record<string, never>, VerifyOutput>();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage="Verifying credentials…"
        connectedTitle="Verify Credentials"
        connectedHint="Call crazy_egg_verify_credentials to test your API + App keys."
      />
    );
  }

  const ok = state.toolResult?.authenticated;

  return (
    <div className="flex items-center justify-center min-h-dvh p-6">
      <Card className={`w-full max-w-md ${ok ? "" : "border-destructive"}`}>
        <CardHeader className="flex-row items-center gap-3">
          {ok ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          ) : (
            <XCircle className="w-6 h-6 text-destructive" />
          )}
          <CardTitle>
            {ok ? "Credentials Valid" : "Authentication Failed"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {ok
              ? "Both CRAZY_EGG_API_KEY and CRAZY_EGG_APP_KEY are accepted by the legacy v2 API."
              : (state.toolResult?.error ??
                "Unable to authenticate against the legacy v2 API.")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
