/**
 * Stores Index
 *
 * Re-exports all Zustand stores and their hooks.
 * Single source of truth: WorkflowEditorStore
 */

export {
  // Store factory
  createWorkflowEditorStore,
  // Provider
  WorkflowEditorProvider,
  // Workflow hooks
  useWorkflow,
  useOriginalWorkflow,
  useIsDirty,
  useIsSaving,
  useErrors,
  // Selection hooks
  useSelectedPhaseIndex,
  useSelectedStepIndex,
  useSelectedStep,
  useIsStepSelected,
  // Phase hooks
  useExpandedPhases,
  useIsPhaseExpanded,
  usePhaseCount,
  usePhase,
  // Step hooks
  useStepCount,
  useStep,
  // Step editor hooks
  useStepEditorTab,
  useStepEditorJsonValue,
  useStepEditorJsonErrors,
  useStepEditorCodeValue,
  useSelectedStepRetry,
  // Actions
  useWorkflowEditorActions,
} from "./workflow-editor-store";
