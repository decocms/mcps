import { PageHeader } from "@/components/page-header.tsx";
import { StatusFrame } from "@/components/status-frame.tsx";
import { Badge } from "@/components/ui/badge.tsx";
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

interface Survey {
  id: string;
  name?: string;
  responses_count?: number;
  status?: string;
}

interface ListSurveysOutput {
  surveys: Survey[];
  total: number;
}

export default function SurveysPage() {
  const state = useMcpState<Record<string, never>, ListSurveysOutput>();

  if (state.status !== "tool-result") {
    return (
      <StatusFrame
        status={state.status}
        error={state.error}
        pendingMessage="Loading surveys…"
        connectedTitle="Surveys"
        connectedHint="Call crazy_egg_list_surveys."
      />
    );
  }

  const { surveys, total } = state.toolResult ?? { surveys: [], total: 0 };

  return (
    <div className="p-6">
      <PageHeader title="Surveys" subtitle={`${total} survey(s)`} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All surveys</CardTitle>
        </CardHeader>
        <CardContent>
          {surveys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No surveys.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Responses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {surveys.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.name ?? s.id}</TableCell>
                    <TableCell>
                      {s.status ? (
                        <Badge
                          variant={
                            s.status === "active" ? "default" : "secondary"
                          }
                          className="capitalize"
                        >
                          {s.status}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {new Intl.NumberFormat().format(s.responses_count ?? 0)}
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
