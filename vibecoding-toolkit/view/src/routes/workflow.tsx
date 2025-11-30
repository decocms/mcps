/**
 * Workflow Detail Page
 *
 * Displays and edits a single workflow with phases and steps.
 * Uses WorkflowEditor with isolated Zustand store state.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import { memo, Suspense, useCallback } from "react";
import {
  createRoute,
  Link,
  RootRoute,
  useParams,
} from "@tanstack/react-router";
import { Icon } from "@decocms/ui/components/icon.tsx";
import { Button } from "@decocms/ui/components/button.tsx";
import { Spinner } from "@decocms/ui/components/spinner.tsx";
import { Toaster } from "sonner";
import { useWorkflowDetail, useUpdateWorkflow } from "@/hooks/useWorkflows";
import { WorkflowEditor } from "@/components/workflow";
import type { Workflow } from "@/lib/workflow-types";

// ============================================================================
// Breadcrumb Component
// ============================================================================

interface BreadcrumbProps {
  items: Array<{ label: string; href?: string }>;
}

const Breadcrumb = memo(function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-muted-foreground">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-2">
          {index > 0 && <Icon name="chevron_right" size={14} />}
          {item.href ? (
            <Link
              to={item.href}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
});

// ============================================================================
// Page Header Component
// ============================================================================

interface WorkflowDetailHeaderProps {
  title: string;
}

const WorkflowDetailHeader = memo(function WorkflowDetailHeader({
  title,
}: WorkflowDetailHeaderProps) {
  return (
    <div className="border-b bg-background">
      <div className="container max-w-6xl py-3">
        <div className="flex items-center justify-between">
          <Breadcrumb
            items={[
              { label: "Workflows", href: "/workflows" },
              { label: title },
            ]}
          />

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/workflows/$workflowId/executions"
                params={{ workflowId: "" }}
              >
                <Icon name="history" size={16} />
                Executions
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Loading State Component
// ============================================================================

const LoadingState = memo(function LoadingState() {
  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div className="border-b bg-background">
        <div className="container max-w-6xl py-3">
          <div className="h-5 w-48 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    </div>
  );
});

// ============================================================================
// Not Found State Component
// ============================================================================

const NotFoundState = memo(function NotFoundState() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)]">
      <Icon name="error" size={48} className="text-muted-foreground mb-4" />
      <h2 className="text-xl font-medium mb-2">Workflow not found</h2>
      <p className="text-muted-foreground mb-4">
        The workflow you're looking for doesn't exist or has been deleted.
      </p>
      <Button asChild>
        <Link to="/workflows">
          <Icon name="arrow_back" size={16} />
          Back to Workflows
        </Link>
      </Button>
    </div>
  );
});

// ============================================================================
// Workflow Detail Content (with data)
// ============================================================================

interface WorkflowDetailContentProps {
  workflowId: string;
}

const WorkflowDetailContent = memo(function WorkflowDetailContent({
  workflowId,
}: WorkflowDetailContentProps) {
  const { data } = useWorkflowDetail(workflowId);
  const updateMutation = useUpdateWorkflow();

  const handleSave = useCallback(
    async (workflow: Workflow) => {
      await updateMutation.mutateAsync({
        id: workflowId,
        data: {
          title: workflow.title,
          description: workflow.description,
          steps: workflow.steps,
          triggers: workflow.triggers,
        },
      });
    },
    [workflowId, updateMutation],
  );

  if (!data.item) {
    return <NotFoundState />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <WorkflowDetailHeader title={data.item.title} />
      <div className="flex-1 overflow-hidden">
        <WorkflowEditor
          workflow={data.item}
          onSave={handleSave}
          className="h-full"
        />
      </div>
    </div>
  );
});

// ============================================================================
// Main Page Component
// ============================================================================

function WorkflowPage() {
  const params = useParams({ from: "/workflows/$workflowId" });

  return (
    <>
      <Suspense fallback={<LoadingState />}>
        <WorkflowDetailContent workflowId={params.workflowId} />
      </Suspense>
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
// Route Export
// ============================================================================

export const workflowRoute = (parentRoute: RootRoute<any>) =>
  createRoute({
    path: "/workflows/$workflowId",
    component: WorkflowPage,
    getParentRoute: () => parentRoute,
  });
