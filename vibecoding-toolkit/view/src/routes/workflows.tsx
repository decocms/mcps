/**
 * Workflows Page
 *
 * Lists all workflows with create, edit, and delete actions.
 * Clean implementation using composition pattern and custom hooks.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import { memo, Suspense, useCallback, useState } from "react";
import {
  createRoute,
  useNavigate,
  type RootRoute,
} from "@tanstack/react-router";
import { Icon } from "@decocms/ui/components/icon.tsx";
import { Button } from "@decocms/ui/components/button.tsx";
import { Spinner } from "@decocms/ui/components/spinner.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@decocms/ui/components/dialog.tsx";
import { Input } from "@decocms/ui/components/input.tsx";
import { Textarea } from "@decocms/ui/components/textarea.tsx";
import { Label } from "@decocms/ui/components/label.tsx";
import { Toaster, toast } from "sonner";
import {
  useWorkflows,
  useCreateWorkflow,
  useDeleteWorkflow,
} from "@/hooks/useWorkflows";
import { WorkflowCard, WorkflowCardSkeleton } from "@/components/workflow";
import type { Workflow } from "@/lib/workflow-types";

// ============================================================================
// Layout Component
// ============================================================================

export function BaseRouteLayout({ children }: { children: React.ReactNode }) {
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
// Page Header Component
// ============================================================================

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const PageHeader = memo(function PageHeader({
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
});

// ============================================================================
// Workflows Grid Component
// ============================================================================

interface WorkflowsGridProps {
  workflows: Workflow[];
  onWorkflowClick: (id: string) => void;
  onWorkflowDelete: (id: string) => void;
}

const WorkflowsGrid = memo(function WorkflowsGrid({
  workflows,
  onWorkflowClick,
  onWorkflowDelete,
}: WorkflowsGridProps) {
  if (workflows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {workflows.map((workflow) => (
        <WorkflowCard
          key={workflow.id}
          workflow={workflow}
          onClick={() => onWorkflowClick(workflow.id)}
          onDelete={() => onWorkflowDelete(workflow.id)}
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
        <Icon name="account_tree" size={32} className="text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No workflows yet</h3>
      <p className="text-muted-foreground">
        Create your first workflow to get started
      </p>
    </div>
  );
});

// ============================================================================
// Loading Grid Component
// ============================================================================

const LoadingGrid = memo(function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <WorkflowCardSkeleton key={i} />
      ))}
    </div>
  );
});

// ============================================================================
// Create Workflow Dialog
// ============================================================================

interface CreateWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (title: string, description: string) => Promise<void>;
  isCreating: boolean;
}

const CreateWorkflowDialog = memo(function CreateWorkflowDialog({
  open,
  onOpenChange,
  onCreate,
  isCreating,
}: CreateWorkflowDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreate(title.trim(), description.trim());
    setTitle("");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Workflow</DialogTitle>
            <DialogDescription>
              Create a new workflow to automate your processes
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My workflow"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this workflow do?"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isCreating}>
              {isCreating ? (
                <>
                  <Spinner size="xs" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
});

// ============================================================================
// Delete Confirmation Dialog
// ============================================================================

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

const DeleteConfirmDialog = memo(function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Workflow</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this workflow? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Spinner size="xs" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

// ============================================================================
// Workflows Page Content (with data)
// ============================================================================

const WorkflowsPageContent = memo(function WorkflowsPageContent() {
  const navigate = useNavigate();
  const { data } = useWorkflows();
  const createMutation = useCreateWorkflow();
  const deleteMutation = useDeleteWorkflow();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<string | null>(null);

  const handleNavigate = useCallback(
    (workflowId: string) => {
      navigate({ to: "/workflows/$workflowId", params: { workflowId } });
    },
    [navigate],
  );

  const handleCreate = useCallback(
    async (title: string, description: string) => {
      try {
        const result = await createMutation.mutateAsync({
          title,
          description,
          steps: [],
          triggers: [],
        });

        if (result.success && result.item) {
          toast.success("Workflow created");
          setShowCreateDialog(false);
          handleNavigate(result.item.id);
        } else if (result.errors) {
          toast.error(result.errors.map((e) => e.message).join(", "));
        }
      } catch (error) {
        toast.error("Failed to create workflow");
      }
    },
    [createMutation, handleNavigate],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteWorkflowId) return;

    try {
      await deleteMutation.mutateAsync(deleteWorkflowId);
      toast.success("Workflow deleted");
      setDeleteWorkflowId(null);
    } catch (error) {
      toast.error("Failed to delete workflow");
    }
  }, [deleteWorkflowId, deleteMutation]);

  return (
    <div className="container max-w-6xl py-8">
      <PageHeader
        title="Workflows"
        description="Manage your automated workflows"
        action={
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Icon name="add" size={16} />
            New Workflow
          </Button>
        }
      />

      <WorkflowsGrid
        workflows={data.items}
        onWorkflowClick={handleNavigate}
        onWorkflowDelete={setDeleteWorkflowId}
      />

      <CreateWorkflowDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={handleCreate}
        isCreating={createMutation.isPending}
      />

      <DeleteConfirmDialog
        open={!!deleteWorkflowId}
        onOpenChange={(open) => !open && setDeleteWorkflowId(null)}
        onConfirm={handleDelete}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
});

// ============================================================================
// Main Page Component
// ============================================================================

function WorkflowsPage() {
  return (
    <BaseRouteLayout>
      <Suspense
        fallback={
          <div className="container max-w-6xl py-8">
            <PageHeader
              title="Workflows"
              description="Manage your automated workflows"
            />
            <LoadingGrid />
          </div>
        }
      >
        <WorkflowsPageContent />
      </Suspense>
    </BaseRouteLayout>
  );
}

// ============================================================================
// Route Export
// ============================================================================

export default (parentRoute: RootRoute<any>) =>
  createRoute({
    path: "/workflows",
    component: WorkflowsPage,
    getParentRoute: () => parentRoute,
  });
