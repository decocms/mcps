import { PageHeader } from "@/components/page-header.tsx";
import { StatusFrame } from "@/components/status-frame.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { useMcpState } from "@/context.tsx";

interface Recording {
  id: string;
  duration?: number;
  url?: string;
  created_at?: string;
}

interface ListRecordingsOutput {
  recordings: Recording[];
  total: number;
}

function fmtDuration(seconds: number | undefined) {
  if (seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export default function RecordingsPage() {
  const state = useMcpState<{ limit?: number }, ListRecordingsOutput>();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage="Loading recordings…"
        connectedTitle="Recordings"
        connectedHint="Call crazy_egg_list_recordings."
      />
    );
  }

  const { recordings, total } = state.toolResult ?? {
    recordings: [],
    total: 0,
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Session Recordings"
        subtitle={`${recordings.length} of ${total}`}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All recordings</CardTitle>
        </CardHeader>
        <CardContent>
          {recordings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recordings.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordings.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs">
                      {r.url ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.created_at ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {fmtDuration(r.duration)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
