/**
 * Executions Page
 *
 * Lists all workflow executions with filtering and details.
 * Clean implementation using composition pattern.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import { memo, Suspense, useCallback, useState } from "react";
import {
  createRoute,
  useNavigate,
  useParams,
  Link,
  type RootRoute,
} from "@tanstack/react-router";
import { Icon } from "@decocms/ui/components/icon";
import { Button } from "@decocms/ui/components/button";
import { Spinner } from "@decocms/ui/components/spinner";
import { Badge } from "@decocms/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@decocms/ui/components/select";
import { Toaster, toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useWorkflowExecutions,
  useStartExecution,
  useCancelExecution,
  formatDuration,
} from "@/hooks/useExecutions";
import { useWorkflowDetail } from "@/hooks/useWorkflows";
import {
  ExecutionCard,
  ExecutionCardSkeleton,
  ExecutionStatusBadge,
} from "@/components/workflow";
import type { WorkflowExecution } from "@/lib/workflow-types";

// ============================================================================
// Layout Component
// ============================================================================

function ExecutionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "max-w-sm text-sm",
          style: {
            padding: "12px 16px",
          },
        }}
      />
    </>
  );
}

// ============================================================================
// Breadcrumb Component
// ============================================================================

interface BreadcrumbProps {
  workflowId: string;
  workflowTitle: string;
}

const Breadcrumb = memo(function Breadcrumb({
  workflowId,
  workflowTitle,
}: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-muted-foreground">
      <Link to="/workflows" className="hover:text-foreground transition-colors">
        Workflows
      </Link>
      <Icon name="chevron_right" size={14} />
      <Link
        to="/workflows/$workflowId"
        params={{ workflowId }}
        className="hover:text-foreground transition-colors"
      >
        {workflowTitle}
      </Link>
      <Icon name="chevron_right" size={14} />
      <span className="text-foreground">Executions</span>
    </nav>
  );
});

// ============================================================================
// Page Header Component
// ============================================================================

interface ExecutionsHeaderProps {
  workflowId: string;
  workflowTitle: string;
  executionCount: number;
  onStartExecution: () => void;
  isStarting: boolean;
}

const ExecutionsHeader = memo(function ExecutionsHeader({
  workflowId,
  workflowTitle,
  executionCount,
  onStartExecution,
  isStarting,
}: ExecutionsHeaderProps) {
  return (
    <div className="border-b bg-background">
      <div className="container max-w-6xl py-4 space-y-4">
        <Breadcrumb workflowId={workflowId} workflowTitle={workflowTitle} />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Icon name="history" size={24} className="text-primary" />
              Executions
            </h1>
            <p className="text-muted-foreground">
              {executionCount}{" "}
              {executionCount === 1 ? "execution" : "executions"} for this
              workflow
            </p>
          </div>

          <Button
            onClick={onStartExecution}
            disabled={isStarting}
            className="gap-2"
          >
            {isStarting ? (
              <>
                <Spinner size="xs" />
                Starting...
              </>
            ) : (
              <>
                <Icon name="play_arrow" size={16} />
                Run Workflow
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Filter Bar Component
// ============================================================================

interface FilterBarProps {
  statusFilter: string;
  onStatusChange: (value: string) => void;
}

const FilterBar = memo(function FilterBar({
  statusFilter,
  onStatusChange,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-4 py-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
});

// ============================================================================
// Executions Grid Component
// ============================================================================

interface ExecutionsGridProps {
  executions: WorkflowExecution[];
  onExecutionClick: (id: string) => void;
}

const ExecutionsGrid = memo(function ExecutionsGrid({
  executions,
  onExecutionClick,
}: ExecutionsGridProps) {
  if (executions.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {executions.map((execution) => (
        <ExecutionCard
          key={execution.id}
          execution={execution}
          onClick={() => onExecutionClick(execution.id)}
        />
      ))}
    </div>
  );
});

// ============================================================================
// Empty State Component
// ============================================================================

const EmptyState = memo(function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
        <Icon name="history" size={32} className="text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No executions yet</h3>
      <p className="text-muted-foreground">
        Run this workflow to see execution history
      </p>
    </div>
  );
});

// ============================================================================
// Loading State Component
// ============================================================================

const LoadingState = memo(function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <ExecutionCardSkeleton key={i} />
      ))}
    </div>
  );
});

// ============================================================================
// Executions Page Content
// ============================================================================

interface ExecutionsPageContentProps {
  workflowId: string;
}

const ExecutionsPageContent = memo(function ExecutionsPageContent({
  workflowId,
}: ExecutionsPageContentProps) {
  const navigate = useNavigate();
  const { data: workflowData } = useWorkflowDetail(workflowId);
  const { data: executionsData } = useWorkflowExecutions(workflowId);
  const startMutation = useStartExecution();

  const [statusFilter, setStatusFilter] = useState("all");

  const filteredExecutions =
    statusFilter === "all"
      ? executionsData.items
      : executionsData.items.filter((e) => e.status === statusFilter);

  const handleStartExecution = useCallback(async () => {
    try {
      const result = await startMutation.mutateAsync({ workflowId });
      toast.success("Execution started");
      navigate({
        to: "/workflows/$workflowId/executions/$executionId",
        params: { workflowId, executionId: result.id },
      });
    } catch (error) {
      toast.error("Failed to start execution");
    }
  }, [workflowId, startMutation, navigate]);

  const handleExecutionClick = useCallback(
    (executionId: string) => {
      navigate({
        to: "/workflows/$workflowId/executions/$executionId",
        params: { workflowId, executionId },
      });
    },
    [workflowId, navigate],
  );

  if (!workflowData.item) {
    return (
      <div className="container max-w-6xl py-8">
        <div className="text-center">
          <p className="text-muted-foreground">Workflow not found</p>
          <Button asChild className="mt-4">
            <Link to="/workflows">Back to Workflows</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <ExecutionsHeader
        workflowId={workflowId}
        workflowTitle={workflowData.item.title}
        executionCount={executionsData.totalCount}
        onStartExecution={handleStartExecution}
        isStarting={startMutation.isPending}
      />

      <div className="container max-w-6xl py-4">
        <FilterBar
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
        />
        <ExecutionsGrid
          executions={filteredExecutions}
          onExecutionClick={handleExecutionClick}
        />
      </div>
    </div>
  );
});

// ============================================================================
// Main Page Component
// ============================================================================

function ExecutionsPage() {
  const params = useParams({
    from: "/workflows/$workflowId/executions",
  });

  return (
    <ExecutionsLayout>
      <Suspense
        fallback={
          <div className="container max-w-6xl py-8">
            <div className="h-24 bg-muted rounded animate-pulse mb-8" />
            <LoadingState />
          </div>
        }
      >
        <ExecutionsPageContent workflowId={params.workflowId} />
      </Suspense>
    </ExecutionsLayout>
  );
}

// ============================================================================
// Route Export
// ============================================================================

export const executionsRoute = (parentRoute: RootRoute<any>) =>
  createRoute({
    path: "/workflows/$workflowId/executions",
    component: ExecutionsPage,
    getParentRoute: () => parentRoute,
  });
