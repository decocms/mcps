/**
 * ExecutionCard Component
 *
 * Displays a workflow execution in a card format.
 * Pure presentational component.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import { memo } from "react";
import { Card, CardContent, CardHeader } from "@decocms/ui/components/card";
import { Badge } from "@decocms/ui/components/badge";
import { Icon } from "@decocms/ui/components/icon";
import { cn } from "@/lib/utils";
import type { WorkflowExecution } from "@/lib/workflow-types";
import { formatDuration } from "@/hooks/useExecutions";

// ============================================================================
// Types
// ============================================================================

interface ExecutionCardProps {
  execution: WorkflowExecution;
  onClick?: () => void;
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusIcon(status: WorkflowExecution["status"]): string {
  switch (status) {
    case "pending":
      return "hourglass_empty";
    case "running":
      return "play_circle";
    case "completed":
      return "check_circle";
    case "cancelled":
      return "cancel";
    default:
      return "help";
  }
}

function getStatusColor(status: WorkflowExecution["status"]): string {
  switch (status) {
    case "pending":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "running":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "completed":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "cancelled":
      return "bg-slate-500/10 text-slate-600 border-slate-500/20";
    default:
      return "bg-slate-500/10 text-slate-600 border-slate-500/20";
  }
}

// ============================================================================
// Sub-components
// ============================================================================

interface ExecutionStatusBadgeProps {
  status: WorkflowExecution["status"];
}

export const ExecutionStatusBadge = memo(function ExecutionStatusBadge({
  status,
}: ExecutionStatusBadgeProps) {
  const icon = getStatusIcon(status);
  const colorClass = getStatusColor(status);

  return (
    <Badge variant="outline" className={cn("gap-1 capitalize", colorClass)}>
      <Icon name={icon} size={12} />
      {status}
    </Badge>
  );
});

interface ExecutionMetaProps {
  execution: WorkflowExecution;
}

const ExecutionMeta = memo(function ExecutionMeta({
  execution,
}: ExecutionMetaProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Icon name="schedule" size={12} />
        {formatDate(execution.created_at)}
      </span>
      {execution.started_at_epoch_ms && (
        <span className="flex items-center gap-1">
          <Icon name="timer" size={12} />
          {formatDuration(
            execution.started_at_epoch_ms,
            execution.completed_at_epoch_ms,
          )}
        </span>
      )}
      {execution.retry_count > 0 && (
        <span className="flex items-center gap-1">
          <Icon name="refresh" size={12} />
          {execution.retry_count} retries
        </span>
      )}
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const ExecutionCard = memo(function ExecutionCard({
  execution,
  onClick,
  className,
}: ExecutionCardProps) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
        className,
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm text-muted-foreground">
            {execution.id.slice(0, 8)}...
          </span>
          <ExecutionStatusBadge status={execution.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {execution.error && (
          <div className="text-sm text-destructive line-clamp-2">
            {execution.error}
          </div>
        )}
        <ExecutionMeta execution={execution} />
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Compact Variant
// ============================================================================

interface ExecutionCardCompactProps {
  execution: WorkflowExecution;
  onClick?: () => void;
}

export const ExecutionCardCompact = memo(function ExecutionCardCompact({
  execution,
  onClick,
}: ExecutionCardCompactProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <button
      type="button"
      className={cn(
        "flex items-center justify-between w-full p-3 rounded-lg border text-left transition-all",
        "hover:border-primary/50 hover:bg-muted/30",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <ExecutionStatusBadge status={execution.status} />
        <span className="font-mono text-xs text-muted-foreground">
          {execution.id.slice(0, 8)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {formatTime(execution.created_at)}
      </span>
    </button>
  );
});

// ============================================================================
// Skeleton Component
// ============================================================================

export function ExecutionCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-muted rounded w-24" />
          <div className="h-5 bg-muted rounded w-20" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-4 bg-muted rounded w-32" />
      </CardContent>
    </Card>
  );
}
