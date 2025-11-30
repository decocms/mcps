/**
 * Workflow Hooks
 *
 * Custom hooks for workflow API calls using TanStack Query.
 * Following best practices: components only consume hooks, everything abstracted.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { client } from "@/lib/rpc";
import type { Workflow, Phase, Trigger } from "@/lib/workflow-types";

// ============================================================================
// Query Keys
// ============================================================================

export const workflowKeys = {
  all: ["workflows"] as const,
  lists: () => [...workflowKeys.all, "list"] as const,
  list: (filters?: WorkflowListFilters) =>
    [...workflowKeys.lists(), filters] as const,
  details: () => [...workflowKeys.all, "detail"] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
};

// ============================================================================
// Types
// ============================================================================

interface WorkflowListFilters {
  limit?: number;
  offset?: number;
  orderBy?: { field: string; direction: "asc" | "desc" }[];
}

interface CreateWorkflowInput {
  title: string;
  description?: string;
  steps: Phase[];
  triggers?: Trigger[];
}

interface UpdateWorkflowInput {
  id: string;
  data: Partial<CreateWorkflowInput>;
}

interface WorkflowListResponse {
  items: Workflow[];
  totalCount: number;
  hasMore: boolean;
}

interface WorkflowGetResponse {
  item: Workflow | null;
}

interface WorkflowInsertResponse {
  success: boolean;
  item?: Workflow;
  errors?: Array<{
    type: string;
    step: string;
    field: string;
    message: string;
  }>;
}

interface WorkflowDeleteResponse {
  success: boolean;
  id: string;
}

// ============================================================================
// List Hooks
// ============================================================================

/**
 * Fetch workflows list with suspense
 */
export function useWorkflows(filters?: WorkflowListFilters) {
  return useSuspenseQuery({
    queryKey: workflowKeys.list(filters),
    queryFn: async () => {
      const result = await client.COLLECTION_WORKFLOW_LIST({
        limit: filters?.limit ?? 50,
        offset: filters?.offset ?? 0,
      });
      return result as unknown as WorkflowListResponse;
    },
  });
}

/**
 * Fetch workflows list without suspense (for conditional loading)
 */
export function useWorkflowsQuery(filters?: WorkflowListFilters) {
  return useQuery({
    queryKey: workflowKeys.list(filters),
    queryFn: async () => {
      const result = await client.COLLECTION_WORKFLOW_LIST({
        limit: filters?.limit ?? 50,
        offset: filters?.offset ?? 0,
      });
      return result as unknown as WorkflowListResponse;
    },
  });
}

// ============================================================================
// Detail Hooks
// ============================================================================

/**
 * Fetch single workflow by ID with suspense
 */
export function useWorkflowDetail(id: string) {
  return useSuspenseQuery({
    queryKey: workflowKeys.detail(id),
    queryFn: () =>
      client.COLLECTION_WORKFLOW_GET({ id }) as Promise<WorkflowGetResponse>,
  });
}

/**
 * Fetch single workflow by ID without suspense
 */
export function useWorkflowQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: workflowKeys.detail(id),
    queryFn: () =>
      client.COLLECTION_WORKFLOW_GET({ id }) as Promise<WorkflowGetResponse>,
    enabled,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Create a new workflow
 */
export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWorkflowInput) => {
      const result = await client.COLLECTION_WORKFLOW_INSERT({
        data: input as any,
      });
      return result as unknown as WorkflowInsertResponse;
    },
    onSuccess: (data) => {
      if (data.success && data.item) {
        // Add to cache
        queryClient.setQueryData(workflowKeys.detail(data.item.id), {
          item: data.item,
        });
        // Invalidate list
        queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
      }
    },
  });
}

/**
 * Update an existing workflow
 */
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateWorkflowInput) => {
      const result = await client.COLLECTION_WORKFLOW_UPDATE({
        id,
        data: data as any,
      });
      return result as unknown as { item: Workflow };
    },
    onSuccess: (data, variables) => {
      // Update cache
      queryClient.setQueryData(workflowKeys.detail(variables.id), {
        item: data.item,
      });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
  });
}

/**
 * Delete a workflow
 */
export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      client.COLLECTION_WORKFLOW_DELETE({
        id,
      }) as Promise<WorkflowDeleteResponse>,
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: workflowKeys.detail(id) });
      // Invalidate list
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
  });
}

// ============================================================================
// Combined Hook for Workflow Editor
// ============================================================================

interface UseWorkflowEditorOptions {
  workflowId: string;
}

interface UseWorkflowEditorReturn {
  // Data
  workflow: Workflow | null;
  isLoading: boolean;
  error: Error | null;

  // Mutations
  save: (data: Partial<CreateWorkflowInput>) => Promise<void>;
  isSaving: boolean;
  saveError: Error | null;

  // Validation errors from server
  validationErrors: Array<{
    type: string;
    step: string;
    field: string;
    message: string;
  }>;
}

/**
 * Combined hook for workflow editor operations
 */
export function useWorkflowEditor({
  workflowId,
}: UseWorkflowEditorOptions): UseWorkflowEditorReturn {
  const {
    data,
    isLoading,
    error: queryError,
  } = useWorkflowQuery(workflowId, !!workflowId);

  const updateMutation = useUpdateWorkflow();

  const save = async (data: Partial<CreateWorkflowInput>) => {
    await updateMutation.mutateAsync({ id: workflowId, data });
  };

  return {
    workflow: data?.item ?? null,
    isLoading,
    error: queryError,
    save,
    isSaving: updateMutation.isPending,
    saveError: updateMutation.error,
    validationErrors: [],
  };
}
