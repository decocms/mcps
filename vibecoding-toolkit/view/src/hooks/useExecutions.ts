/**
 * Execution Hooks
 *
 * Custom hooks for workflow execution API calls using TanStack Query.
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
import type {
  WorkflowExecution,
  ExecutionStepResult,
  WorkflowEvent,
} from "@/lib/workflow-types";

// ============================================================================
// Query Keys
// ============================================================================

export const executionKeys = {
  all: ["executions"] as const,
  lists: () => [...executionKeys.all, "list"] as const,
  list: (filters?: ExecutionListFilters) =>
    [...executionKeys.lists(), filters] as const,
  byWorkflow: (workflowId: string) =>
    [...executionKeys.lists(), { workflowId }] as const,
  details: () => [...executionKeys.all, "detail"] as const,
  detail: (id: string) => [...executionKeys.details(), id] as const,
  steps: (executionId: string) =>
    [...executionKeys.detail(executionId), "steps"] as const,
  events: (executionId: string) =>
    [...executionKeys.detail(executionId), "events"] as const,
};

// ============================================================================
// Types
// ============================================================================

interface ExecutionListFilters {
  workflowId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface ExecutionListResponse {
  items: WorkflowExecution[];
  totalCount: number;
  hasMore: boolean;
}

interface ExecutionDetailResponse {
  execution: WorkflowExecution;
  steps: ExecutionStepResult[];
  events: WorkflowEvent[];
}

// ============================================================================
// List Hooks
// ============================================================================

/**
 * Fetch executions list with suspense
 */
export function useExecutions(filters?: ExecutionListFilters) {
  return useSuspenseQuery({
    queryKey: executionKeys.list(filters),
    queryFn: async () => {
      // TODO: Replace with actual API call when available
      // For now, return mock data structure
      return {
        items: [] as WorkflowExecution[],
        totalCount: 0,
        hasMore: false,
      } as ExecutionListResponse;
    },
  });
}

/**
 * Fetch executions for a specific workflow
 */
export function useWorkflowExecutions(workflowId: string) {
  return useSuspenseQuery({
    queryKey: executionKeys.byWorkflow(workflowId),
    queryFn: async () => {
      // TODO: Replace with actual API call when available
      return {
        items: [] as WorkflowExecution[],
        totalCount: 0,
        hasMore: false,
      } as ExecutionListResponse;
    },
  });
}

/**
 * Fetch executions list without suspense
 */
export function useExecutionsQuery(filters?: ExecutionListFilters) {
  return useQuery({
    queryKey: executionKeys.list(filters),
    queryFn: async () => {
      // TODO: Replace with actual API call when available
      return {
        items: [] as WorkflowExecution[],
        totalCount: 0,
        hasMore: false,
      } as ExecutionListResponse;
    },
  });
}

// ============================================================================
// Detail Hooks
// ============================================================================

/**
 * Fetch single execution by ID with suspense
 */
export function useExecutionDetail(id: string) {
  return useSuspenseQuery({
    queryKey: executionKeys.detail(id),
    queryFn: async () => {
      // TODO: Replace with actual API call when available
      return null as ExecutionDetailResponse | null;
    },
  });
}

/**
 * Fetch single execution by ID without suspense
 */
export function useExecutionQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: executionKeys.detail(id),
    queryFn: async () => {
      // TODO: Replace with actual API call when available
      return null as ExecutionDetailResponse | null;
    },
    enabled,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Start a new execution of a workflow
 */
export function useStartExecution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      workflowId: string;
      input?: Record<string, unknown>;
    }) => {
      // TODO: Replace with actual API call when available
      return {
        id: crypto.randomUUID(),
        workflow_id: params.workflowId,
        status: "pending" as const,
        input: params.input,
        created_at: Date.now(),
        updated_at: Date.now(),
        retry_count: 0,
        max_retries: 10,
      } as WorkflowExecution;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: executionKeys.byWorkflow(data.workflow_id),
      });
    },
  });
}

/**
 * Cancel a running execution
 */
export function useCancelExecution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (executionId: string) => {
      // TODO: Replace with actual API call when available
      return { success: true, id: executionId };
    },
    onSuccess: (_, executionId) => {
      queryClient.invalidateQueries({
        queryKey: executionKeys.detail(executionId),
      });
    },
  });
}

// ============================================================================
// Combined Hook for Execution Viewer
// ============================================================================

interface UseExecutionViewerOptions {
  executionId: string;
}

interface UseExecutionViewerReturn {
  execution: WorkflowExecution | null;
  steps: ExecutionStepResult[];
  events: WorkflowEvent[];
  isLoading: boolean;
  error: Error | null;
  cancel: () => Promise<void>;
  isCancelling: boolean;
}

/**
 * Combined hook for execution viewer operations
 */
export function useExecutionViewer({
  executionId,
}: UseExecutionViewerOptions): UseExecutionViewerReturn {
  const { data, isLoading, error } = useExecutionQuery(executionId);
  const cancelMutation = useCancelExecution();

  const cancel = async () => {
    await cancelMutation.mutateAsync(executionId);
  };

  return {
    execution: data?.execution ?? null,
    steps: data?.steps ?? [],
    events: data?.events ?? [],
    isLoading,
    error,
    cancel,
    isCancelling: cancelMutation.isPending,
  };
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Get execution status color
 */
export function useExecutionStatusColor(
  status: WorkflowExecution["status"],
): string {
  switch (status) {
    case "pending":
      return "text-amber-600 bg-amber-50";
    case "running":
      return "text-blue-600 bg-blue-50";
    case "completed":
      return "text-emerald-600 bg-emerald-50";
    case "cancelled":
      return "text-slate-600 bg-slate-50";
    default:
      return "text-slate-600 bg-slate-50";
  }
}

/**
 * Format execution duration
 */
export function formatDuration(startMs?: number, endMs?: number): string {
  if (!startMs) return "-";
  const end = endMs ?? Date.now();
  const durationMs = end - startMs;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
