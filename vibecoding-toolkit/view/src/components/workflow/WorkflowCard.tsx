/**
 * WorkflowCard Component
 *
 * Displays a workflow in a card format for list views.
 * Pure presentational component - no state management.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import { memo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@decocms/ui/components/card.tsx";
import { Badge } from "@decocms/ui/components/badge.tsx";
import { Icon } from "@decocms/ui/components/icon.tsx";
import { cn } from "@/lib/utils";
import type { Workflow } from "@/lib/workflow-types";

// ============================================================================
// Types
// ============================================================================

interface WorkflowCardProps {
  workflow: Workflow;
  onClick?: () => void;
  onDelete?: () => void;
  className?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

interface WorkflowCardBadgesProps {
  phaseCount: number;
  stepCount: number;
  triggerCount: number;
}

const WorkflowCardBadges = memo(function WorkflowCardBadges({
  phaseCount,
  stepCount,
  triggerCount,
}: WorkflowCardBadgesProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="secondary" className="gap-1">
        <Icon name="layers" size={12} />
        {phaseCount} {phaseCount === 1 ? "phase" : "phases"}
      </Badge>
      <Badge variant="secondary" className="gap-1">
        <Icon name="flag" size={12} />
        {stepCount} {stepCount === 1 ? "step" : "steps"}
      </Badge>
      {triggerCount > 0 && (
        <Badge variant="outline" className="gap-1">
          <Icon name="bolt" size={12} />
          {triggerCount} {triggerCount === 1 ? "trigger" : "triggers"}
        </Badge>
      )}
    </div>
  );
});

interface WorkflowCardMetaProps {
  createdAt: string;
  updatedAt: string;
}

const WorkflowCardMeta = memo(function WorkflowCardMeta({
  createdAt,
  updatedAt,
}: WorkflowCardMetaProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span>Created {formatDate(createdAt)}</span>
      <span>Updated {formatDate(updatedAt)}</span>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const WorkflowCard = memo(function WorkflowCard({
  workflow,
  onClick,
  onDelete,
  className,
}: WorkflowCardProps) {
  const phaseCount = workflow.steps.length;
  const stepCount = workflow.steps.reduce(
    (acc, phase) => acc + phase.length,
    0,
  );
  const triggerCount = workflow.triggers?.length ?? 0;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
        "group relative",
        className,
      )}
      onClick={onClick}
    >
      {onDelete && (
        <button
          type="button"
          className={cn(
            "absolute top-3 right-3 p-1.5 rounded-md",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            "hover:bg-destructive/10 text-muted-foreground hover:text-destructive",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete workflow"
        >
          <Icon name="delete" size={16} />
        </button>
      )}

      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Icon name="account_tree" size={20} className="text-primary" />
          {workflow.title}
        </CardTitle>
        {workflow.description && (
          <CardDescription className="line-clamp-2">
            {workflow.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <WorkflowCardBadges
          phaseCount={phaseCount}
          stepCount={stepCount}
          triggerCount={triggerCount}
        />
        <WorkflowCardMeta
          createdAt={workflow.created_at}
          updatedAt={workflow.updated_at}
        />
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Skeleton Component
// ============================================================================

export function WorkflowCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
        <div className="h-6 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-full mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="h-5 bg-muted rounded w-20" />
          <div className="h-5 bg-muted rounded w-16" />
        </div>
        <div className="h-4 bg-muted rounded w-1/2" />
      </CardContent>
    </Card>
  );
}
