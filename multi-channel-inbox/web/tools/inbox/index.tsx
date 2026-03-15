import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useMcpState } from "@/context.tsx";
import { cn } from "@/lib/utils.ts";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import type {
  Conversation,
  InboxStats,
  Message,
  Source,
  SourceFilter,
  StatusFilter,
} from "./types.ts";

// --- Constants ---

const SOURCE_ICONS: Record<string, string> = {
  slack: "\u{1F4AC}",
  discord: "\u{1F3AE}",
  gmail: "\u{1F4E7}",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  archived: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  normal: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
  low: "bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400",
};

// --- Result types ---

interface ListConversationsResult {
  conversations: Conversation[];
  total: number;
}

interface GetConversationResult {
  conversation: Conversation;
  messages: Message[];
}

interface ListSourcesResult {
  sources: Source[];
}

interface ActionResult {
  message: string;
  success?: boolean;
  id?: string;
  archived_count?: number;
  category?: string | null;
  priority?: string | null;
  summary?: string | null;
  suggested_reply?: string | null;
}

type ToolResult =
  | ListConversationsResult
  | GetConversationResult
  | ListSourcesResult
  | InboxStats
  | ActionResult;

// --- Helpers ---

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

// --- Main ---

export default function InboxPage() {
  const state = useMcpState<unknown, ToolResult>();

  if (state.status === "initializing" || state.status === "connected") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">
            {state.status === "initializing"
              ? "Connecting..."
              : "Waiting for tool call..."}
          </span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive text-base">Error</CardTitle>
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

  if (state.status === "tool-input") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Processing...</span>
        </div>
      </div>
    );
  }

  if (state.status === "tool-cancelled") {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <p className="text-sm text-muted-foreground">Operation cancelled.</p>
      </div>
    );
  }

  const result = state.toolResult;
  if (!result) return null;

  const toolName = state.toolName;

  // Route by toolName first, then by result shape
  if (toolName === "inbox_stats" && "by_status" in result) {
    return <StatsView stats={result as InboxStats} />;
  }

  if (toolName === "inbox_list_sources" && "sources" in result) {
    return <SourcesView sources={(result as ListSourcesResult).sources} />;
  }

  if ("conversations" in result) {
    return <ConversationListView result={result as ListConversationsResult} />;
  }

  if ("conversation" in result && "messages" in result) {
    const r = result as GetConversationResult;
    return (
      <ConversationDetailView
        conversation={r.conversation}
        messages={r.messages}
      />
    );
  }

  // AI tool results
  if (toolName === "inbox_classify" && "category" in result) {
    const r = result as ActionResult;
    return (
      <ActionResultView
        title="Classification"
        message={r.message}
        details={[
          {
            label: "Category",
            value: r.category || "N/A",
          },
          {
            label: "Priority",
            value: r.priority || "N/A",
          },
        ]}
      />
    );
  }

  if (toolName === "inbox_summarize" && "summary" in result) {
    const r = result as ActionResult;
    return (
      <ActionResultView
        title="Summary"
        message={r.message}
        longText={r.summary || undefined}
      />
    );
  }

  if (toolName === "inbox_suggest_reply" && "suggested_reply" in result) {
    const r = result as ActionResult;
    return (
      <ActionResultView
        title="Suggested Reply"
        message={r.message}
        longText={r.suggested_reply || undefined}
      />
    );
  }

  // Generic action result (reply, archive, update, add/remove source)
  if ("message" in result) {
    const r = result as ActionResult;
    return (
      <ActionResultView
        title="Done"
        message={r.message}
        details={
          r.archived_count !== undefined
            ? [
                {
                  label: "Archived",
                  value: `${r.archived_count} conversations`,
                },
              ]
            : undefined
        }
      />
    );
  }

  // Fallback
  return (
    <div className="flex items-center justify-center min-h-dvh p-6">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-6">
          <pre className="text-xs overflow-auto whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Conversation List ---

function ConversationListView({ result }: { result: ListConversationsResult }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(undefined);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(undefined);

  const conversations = result.conversations.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (sourceFilter && c.source_type !== sourceFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-dvh">
      <div className="border-b p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">
            Inbox{" "}
            <span className="text-muted-foreground text-sm font-normal">
              ({result.total})
            </span>
          </h1>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["open", "in_progress", "resolved", "archived"] as const).map(
            (s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setStatusFilter(statusFilter === s ? undefined : s)
                }
              >
                {s.replace("_", " ")}
              </Button>
            ),
          )}
          <Separator orientation="vertical" className="h-7 mx-1" />
          {(["slack", "discord", "gmail"] as const).map((s) => (
            <Button
              key={s}
              variant={sourceFilter === s ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                setSourceFilter(sourceFilter === s ? undefined : s)
              }
            >
              {SOURCE_ICONS[s]} {s}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <span className="text-2xl">{"\u{1F4ED}"}</span>
            <span className="text-sm">No conversations found</span>
          </div>
        ) : (
          <div className="divide-y">
            {conversations.map((conv) => (
              <ConversationRow key={conv.id} conversation={conv} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function ConversationRow({ conversation: c }: { conversation: Conversation }) {
  return (
    <div className="p-3 hover:bg-accent/50 cursor-pointer transition-colors">
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm shrink-0">
            {SOURCE_ICONS[c.source_type]}
          </span>
          <span className="font-medium text-sm truncate">
            {c.customer_name || "Unknown"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge
            variant="outline"
            className={cn("text-[10px] px-1.5 py-0", STATUS_COLORS[c.status])}
          >
            {c.status.replace("_", " ")}
          </Badge>
          {c.priority && c.priority !== "normal" && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                PRIORITY_COLORS[c.priority],
              )}
            >
              {c.priority}
            </Badge>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground truncate pl-6">
        {c.subject || "No subject"}
      </p>
      <div className="flex items-center gap-2 mt-1 pl-6 text-[11px] text-muted-foreground">
        <span>{c.message_count} msg</span>
        {c.last_message_at && (
          <>
            <span>{"\u00B7"}</span>
            <span>{relativeTime(c.last_message_at)}</span>
          </>
        )}
        {c.category && (
          <>
            <span>{"\u00B7"}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {c.category.replace("_", " ")}
            </Badge>
          </>
        )}
      </div>
    </div>
  );
}

// --- Conversation Detail ---

function ConversationDetailView({
  conversation: c,
  messages,
}: {
  conversation: Conversation;
  messages: Message[];
}) {
  const [reply, setReply] = useState("");

  return (
    <div className="flex flex-col h-dvh">
      {/* Header */}
      <div className="border-b p-4 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm">{SOURCE_ICONS[c.source_type]}</span>
          <h1 className="font-semibold text-sm truncate">
            {c.customer_name || "Unknown"}
          </h1>
          <Badge
            variant="outline"
            className={cn("text-[10px] px-1.5 py-0", STATUS_COLORS[c.status])}
          >
            {c.status.replace("_", " ")}
          </Badge>
          {c.priority && c.priority !== "normal" && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                PRIORITY_COLORS[c.priority],
              )}
            >
              {c.priority}
            </Badge>
          )}
          {c.category && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {c.category.replace("_", " ")}
            </Badge>
          )}
        </div>
        {c.subject && (
          <p className="text-sm text-muted-foreground pl-6">{c.subject}</p>
        )}
        {c.ai_summary && (
          <div className="ml-6 mt-1 p-2 rounded-md bg-muted/50 text-xs text-muted-foreground italic">
            {c.ai_summary}
          </div>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3 max-w-2xl mx-auto">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      </ScrollArea>

      {/* Reply composer */}
      <div className="border-t p-3">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Textarea
            placeholder={`Reply via ${c.source_type}...`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="min-h-[56px] resize-none text-sm"
            rows={2}
          />
          <Button
            size="sm"
            disabled={!reply.trim()}
            className="self-end shrink-0"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message: msg }: { message: Message }) {
  const isInbound = msg.direction === "inbound";

  return (
    <div
      className={cn(
        "max-w-[85%] rounded-lg p-3",
        isInbound ? "bg-accent mr-auto" : "bg-primary/10 ml-auto",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium">
          {isInbound ? msg.sender_name || "Customer" : "Support Agent"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {relativeTime(msg.created_at)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
      {msg.has_attachments && (
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
          <span>{"\u{1F4CE}"}</span>
          <span>Has attachments</span>
        </div>
      )}
    </div>
  );
}

// --- Stats Dashboard ---

function StatsView({ stats }: { stats: InboxStats }) {
  return (
    <div className="flex flex-col h-dvh">
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">Dashboard</h1>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-2xl mx-auto">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs">
                  Total Conversations
                </CardDescription>
                <CardTitle className="text-2xl">
                  {stats.total_conversations}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs">Open</CardDescription>
                <CardTitle className="text-2xl text-blue-600">
                  {stats.total_open}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* By Status */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">By Status</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-2">
                {stats.by_status.map((s) => (
                  <StatusBar
                    key={s.status}
                    label={s.status.replace("_", " ")}
                    count={Number(s.count)}
                    total={stats.total_conversations}
                    colorClass={STATUS_COLORS[s.status] || "bg-gray-100"}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* By Source */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">By Source</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-2">
                {stats.by_source.map((s) => (
                  <div
                    key={s.source_type}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>
                      {SOURCE_ICONS[s.source_type] || ""} {s.source_type}
                    </span>
                    <span className="font-medium tabular-nums">
                      {Number(s.count)}
                    </span>
                  </div>
                ))}
                {stats.by_source.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No active conversations
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* By Priority */}
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">By Priority</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-2">
                {stats.by_priority.map((p) => {
                  const activeTotal = stats.by_source.reduce(
                    (sum, s) => sum + Number(s.count),
                    0,
                  );
                  return (
                    <StatusBar
                      key={p.priority}
                      label={p.priority}
                      count={Number(p.count)}
                      total={activeTotal}
                      colorClass={PRIORITY_COLORS[p.priority] || "bg-gray-100"}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

function StatusBar({
  label,
  count,
  total,
  colorClass,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="capitalize">{label}</span>
        <span className="font-medium tabular-nums">
          {count}{" "}
          <span className="text-muted-foreground text-xs">({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full", colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// --- Sources List ---

function SourcesView({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-col h-dvh">
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">
          Sources{" "}
          <span className="text-muted-foreground text-sm font-normal">
            ({sources.length})
          </span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Channels and labels being monitored for support messages.
        </p>
      </div>
      <ScrollArea className="flex-1">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <span className="text-2xl">{"\u{1F50C}"}</span>
            <span className="text-sm">No sources configured</span>
            <span className="text-xs">
              Use inbox_add_source to add a channel or label.
            </span>
          </div>
        ) : (
          <div className="divide-y">
            {sources.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function SourceRow({ source }: { source: Source }) {
  const name =
    source.external_channel_name ||
    source.gmail_label ||
    source.gmail_query ||
    source.external_channel_id ||
    "Unknown";

  return (
    <div className="p-3 flex items-center gap-3">
      <span className="text-lg shrink-0">
        {SOURCE_ICONS[source.source_type] || "\u{2753}"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{name}</span>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 capitalize"
          >
            {source.source_type}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          Connection: {source.connection_id.slice(0, 12)}...
        </p>
      </div>
      <Badge
        variant={source.enabled ? "default" : "secondary"}
        className="text-[10px] shrink-0"
      >
        {source.enabled ? "Active" : "Disabled"}
      </Badge>
    </div>
  );
}

// --- Action Result ---

function ActionResultView({
  title,
  message,
  details,
  longText,
}: {
  title: string;
  message: string;
  details?: Array<{ label: string; value: string }>;
  longText?: string;
}) {
  return (
    <div className="flex items-center justify-center min-h-dvh p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <span className="text-green-600 text-lg">{"\u2713"}</span>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <CardDescription className="text-sm">{message}</CardDescription>
        </CardHeader>
        {(details || longText) && (
          <CardContent className="space-y-3">
            {details?.map((d) => (
              <div
                key={d.label}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">{d.label}</span>
                <Badge variant="outline" className="capitalize">
                  {d.value}
                </Badge>
              </div>
            ))}
            {longText && (
              <div className="p-3 rounded-md bg-muted/50 text-sm whitespace-pre-wrap">
                {longText}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
