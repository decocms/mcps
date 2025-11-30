/**
 * PhaseCard Component
 *
 * Displays a workflow phase (group of parallel steps).
 * Uses composition pattern with child components.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import { memo, type ReactNode } from "react";
import { Icon } from "@decocms/ui/components/icon.tsx";
import { Button } from "@decocms/ui/components/button.tsx";
import { Badge } from "@decocms/ui/components/badge.tsx";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@decocms/ui/components/collapsible.tsx";

// ============================================================================
// Types
// ============================================================================

interface PhaseCardProps {
  phaseIndex: number;
  stepCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAddStep: () => void;
  onRemovePhase?: () => void;
  children: ReactNode;
  className?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

interface PhaseHeaderProps {
  phaseIndex: number;
  stepCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAddStep: () => void;
  onRemovePhase?: () => void;
}

const PhaseHeader = memo(function PhaseHeader({
  phaseIndex,
  stepCount,
  isExpanded,
  onToggleExpand,
  onAddStep,
  onRemovePhase,
}: PhaseHeaderProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-t-lg border-b">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 hover:text-primary transition-colors"
          onClick={onToggleExpand}
        >
          <Icon
            name={isExpanded ? "expand_more" : "chevron_right"}
            size={20}
            className="transition-transform"
          />
          <span className="font-medium">Phase {phaseIndex + 1}</span>
          <Badge variant="secondary" className="ml-2">
            {stepCount} {stepCount === 1 ? "step" : "steps"}
          </Badge>
        </button>
      </CollapsibleTrigger>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onAddStep}
          className="h-8 gap-1"
        >
          <Icon name="add" size={16} />
          Add Step
        </Button>
        {onRemovePhase && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemovePhase}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Icon name="delete" size={16} />
          </Button>
        )}
      </div>
    </div>
  );
});

interface PhaseContentProps {
  children: ReactNode;
  isEmpty: boolean;
}

const PhaseContent = memo(function PhaseContent({
  children,
  isEmpty,
}: PhaseContentProps) {
  if (isEmpty) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Icon name="flag" size={32} className="mx-auto mb-2 opacity-50" />
        <p>No steps in this phase</p>
        <p className="text-sm">Click "Add Step" to create a step</p>
      </div>
    );
  }

  return <div className="p-3 space-y-3">{children}</div>;
});

// ============================================================================
// Connector Component
// ============================================================================

export const PhaseConnector = memo(function PhaseConnector() {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="flex flex-col items-center text-muted-foreground">
        <div className="w-px h-4 bg-border" />
        <Icon name="arrow_downward" size={16} />
        <div className="w-px h-4 bg-border" />
      </div>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const PhaseCard = memo(function PhaseCard({
  phaseIndex,
  stepCount,
  isExpanded,
  onToggleExpand,
  onAddStep,
  onRemovePhase,
  children,
  className,
}: PhaseCardProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
      <div className={cn("border rounded-lg bg-card shadow-sm", className)}>
        <PhaseHeader
          phaseIndex={phaseIndex}
          stepCount={stepCount}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          onAddStep={onAddStep}
          onRemovePhase={onRemovePhase}
        />
        <CollapsibleContent>
          <PhaseContent isEmpty={stepCount === 0}>{children}</PhaseContent>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
});

// ============================================================================
// Skeleton Component
// ============================================================================

export function PhaseCardSkeleton() {
  return (
    <div className="border rounded-lg bg-card shadow-sm animate-pulse">
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-t-lg border-b">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-muted rounded" />
          <div className="w-20 h-5 bg-muted rounded" />
          <div className="w-12 h-5 bg-muted rounded" />
        </div>
        <div className="w-20 h-8 bg-muted rounded" />
      </div>
      <div className="p-3 space-y-3">
        <div className="h-16 bg-muted rounded" />
        <div className="h-16 bg-muted rounded" />
      </div>
    </div>
  );
}
