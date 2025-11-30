/**
 * WorkflowEditor Component
 *
 * Main workflow editor that composes phases, steps, and the step editor.
 * Uses WorkflowEditorProvider for isolated state management.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import { memo, useCallback, useState } from "react";
import { Icon } from "@decocms/ui/components/icon.tsx";
import { Button } from "@decocms/ui/components/button.tsx";
import { Input } from "@decocms/ui/components/input.tsx";
import { Textarea } from "@decocms/ui/components/textarea.tsx";
import { Spinner } from "@decocms/ui/components/spinner.tsx";
import { Alert, AlertDescription } from "@decocms/ui/components/alert.tsx";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Workflow } from "@/lib/workflow-types";
import { createDefaultStep } from "@/lib/workflow-types";
import {
  WorkflowEditorProvider,
  useWorkflow,
  useIsDirty,
  useIsSaving,
  useErrors,
  useIsPhaseExpanded,
  useSelectedPhaseIndex,
  useSelectedStepIndex,
  useSelectedStep,
  useWorkflowEditorActions,
} from "@/stores/workflow-editor-store";
import type { Step } from "@/lib/workflow-types";
import { PhaseCard, PhaseConnector } from "./PhaseCard";
import { StepCard } from "./StepCard";
import { StepEditor } from "./StepEditor";

// ============================================================================
// Types
// ============================================================================

interface WorkflowEditorProps {
  workflow: Workflow;
  onSave: (workflow: Workflow) => Promise<void>;
  className?: string;
}

// ============================================================================
// Inner Component (consumes store)
// ============================================================================

interface WorkflowEditorInnerProps {
  onSave: (workflow: Workflow) => Promise<void>;
  className?: string;
}

const WorkflowEditorInner = memo(function WorkflowEditorInner({
  onSave,
  className,
}: WorkflowEditorInnerProps) {
  const workflow = useWorkflow();
  const isDirty = useIsDirty();
  const isSaving = useIsSaving();
  const errors = useErrors();
  const selectedStep = useSelectedStep();
  const actions = useWorkflowEditorActions();
  const [showStepEditor, setShowStepEditor] = useState(false);

  const handleSave = useCallback(async () => {
    if (!workflow) return;

    actions.setSaving(true);
    actions.clearErrors();

    try {
      await onSave(workflow);
      actions.markClean();
      toast.success("Workflow saved successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save";
      actions.setErrors([message]);
      toast.error(message);
    } finally {
      actions.setSaving(false);
    }
  }, [workflow, onSave, actions]);

  const handleAddStep = useCallback(
    (phaseIndex: number) => {
      const stepName = `step_${Date.now()}`;
      const step = createDefaultStep(stepName);
      actions.addStep(phaseIndex, step);
      setShowStepEditor(true);
    },
    [actions],
  );

  const handleSelectStep = useCallback(
    (phaseIndex: number, stepIndex: number) => {
      actions.selectStep(phaseIndex, stepIndex);
      setShowStepEditor(true);
    },
    [actions],
  );

  const handleEditStep = useCallback(
    (phaseIndex: number, stepIndex: number) => {
      actions.selectStep(phaseIndex, stepIndex);
      setShowStepEditor(true);
    },
    [actions],
  );

  const handleDeleteStep = useCallback(
    (phaseIndex: number, stepIndex: number) => {
      actions.removeStep(phaseIndex, stepIndex);
      if (showStepEditor) {
        setShowStepEditor(false);
      }
    },
    [actions, showStepEditor],
  );

  const handleCloseStepEditor = useCallback(() => {
    setShowStepEditor(false);
    actions.clearSelection();
  }, [actions]);

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full", className)}>
      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <WorkflowEditorHeader
          title={workflow.title}
          description={workflow.description}
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={handleSave}
          onTitleChange={(title) => actions.updateWorkflowMetadata({ title })}
          onDescriptionChange={(description) =>
            actions.updateWorkflowMetadata({ description })
          }
          onReset={() => actions.resetWorkflow()}
        />

        {/* Errors */}
        {errors.length > 0 && (
          <div className="p-4 border-b">
            <Alert variant="destructive">
              <Icon name="error" size={16} />
              <AlertDescription>
                <ul className="list-disc list-inside">
                  {errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Phases list */}
        <div className="flex-1 overflow-auto p-4">
          <WorkflowPhasesList
            workflow={workflow}
            onAddStep={handleAddStep}
            onSelectStep={handleSelectStep}
            onEditStep={handleEditStep}
            onDeleteStep={handleDeleteStep}
            onAddPhase={() => actions.addPhase()}
            onRemovePhase={(i) => actions.removePhase(i)}
          />
        </div>
      </div>

      {/* Step editor panel */}
      {showStepEditor && selectedStep && (
        <div className="w-[480px] border-l bg-card flex flex-col">
          <StepEditor onClose={handleCloseStepEditor} className="h-full" />
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Header Component
// ============================================================================

interface WorkflowEditorHeaderProps {
  title: string;
  description?: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onReset: () => void;
}

const WorkflowEditorHeader = memo(function WorkflowEditorHeader({
  title,
  description,
  isDirty,
  isSaving,
  onSave,
  onTitleChange,
  onDescriptionChange,
  onReset,
}: WorkflowEditorHeaderProps) {
  return (
    <div className="border-b bg-muted/30">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="account_tree" size={24} className="text-primary" />
            <Input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="text-xl font-semibold h-auto py-1 px-2 border-transparent hover:border-input focus:border-input"
              placeholder="Workflow title"
            />
            {isDirty && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                Unsaved changes
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isDirty && (
              <Button variant="outline" size="sm" onClick={onReset}>
                <Icon name="undo" size={16} />
                Discard
              </Button>
            )}
            <Button size="sm" onClick={onSave} disabled={!isDirty || isSaving}>
              {isSaving ? (
                <>
                  <Spinner size="xs" />
                  Saving...
                </>
              ) : (
                <>
                  <Icon name="save" size={16} />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>

        <Textarea
          value={description ?? ""}
          onChange={(e) => onDescriptionChange(e.target.value)}
          className="resize-none text-sm text-muted-foreground border-transparent hover:border-input focus:border-input"
          placeholder="Add a description..."
          rows={2}
        />
      </div>
    </div>
  );
});

// ============================================================================
// Phases List Component
// ============================================================================

interface WorkflowPhasesListProps {
  workflow: Workflow;
  onAddStep: (phaseIndex: number) => void;
  onSelectStep: (phaseIndex: number, stepIndex: number) => void;
  onEditStep: (phaseIndex: number, stepIndex: number) => void;
  onDeleteStep: (phaseIndex: number, stepIndex: number) => void;
  onAddPhase: () => void;
  onRemovePhase: (phaseIndex: number) => void;
}

const WorkflowPhasesList = memo(function WorkflowPhasesList({
  workflow,
  onAddStep,
  onSelectStep,
  onEditStep,
  onDeleteStep,
  onAddPhase,
  onRemovePhase,
}: WorkflowPhasesListProps) {
  return (
    <div className="space-y-2 max-w-3xl mx-auto">
      {workflow.steps.length === 0 ? (
        <EmptyPhasesState onAddPhase={onAddPhase} />
      ) : (
        <>
          {workflow.steps.map((phase, phaseIndex) => (
            <div key={phaseIndex}>
              {phaseIndex > 0 && <PhaseConnector />}
              <PhaseWithSteps
                phaseIndex={phaseIndex}
                steps={phase}
                onAddStep={() => onAddStep(phaseIndex)}
                onSelectStep={(stepIndex) =>
                  onSelectStep(phaseIndex, stepIndex)
                }
                onEditStep={(stepIndex) => onEditStep(phaseIndex, stepIndex)}
                onDeleteStep={(stepIndex) =>
                  onDeleteStep(phaseIndex, stepIndex)
                }
                onRemovePhase={
                  workflow.steps.length > 1
                    ? () => onRemovePhase(phaseIndex)
                    : undefined
                }
              />
            </div>
          ))}

          <div className="flex justify-center pt-4">
            <Button variant="outline" onClick={onAddPhase} className="gap-2">
              <Icon name="add" size={16} />
              Add Phase
            </Button>
          </div>
        </>
      )}
    </div>
  );
});

// ============================================================================
// Phase With Steps Component
// ============================================================================

interface PhaseWithStepsProps {
  phaseIndex: number;
  steps: Step[];
  onAddStep: () => void;
  onSelectStep: (stepIndex: number) => void;
  onEditStep: (stepIndex: number) => void;
  onDeleteStep: (stepIndex: number) => void;
  onRemovePhase?: () => void;
}

const PhaseWithSteps = memo(function PhaseWithSteps({
  phaseIndex,
  steps,
  onAddStep,
  onSelectStep,
  onEditStep,
  onDeleteStep,
  onRemovePhase,
}: PhaseWithStepsProps) {
  const isExpanded = useIsPhaseExpanded(phaseIndex);
  const selectedPhaseIndex = useSelectedPhaseIndex();
  const selectedStepIndex = useSelectedStepIndex();
  const actions = useWorkflowEditorActions();

  return (
    <PhaseCard
      phaseIndex={phaseIndex}
      stepCount={steps.length}
      isExpanded={isExpanded}
      onToggleExpand={() => actions.togglePhaseExpanded(phaseIndex)}
      onAddStep={onAddStep}
      onRemovePhase={onRemovePhase}
    >
      {steps.map((step, stepIndex) => (
        <StepCard
          key={step.name}
          step={step}
          phaseIndex={phaseIndex}
          stepIndex={stepIndex}
          isSelected={
            selectedPhaseIndex === phaseIndex && selectedStepIndex === stepIndex
          }
          onSelect={() => onSelectStep(stepIndex)}
          onEdit={() => onEditStep(stepIndex)}
          onDelete={() => onDeleteStep(stepIndex)}
        />
      ))}
    </PhaseCard>
  );
});

// ============================================================================
// Empty State Component
// ============================================================================

interface EmptyPhasesStateProps {
  onAddPhase: () => void;
}

const EmptyPhasesState = memo(function EmptyPhasesState({
  onAddPhase,
}: EmptyPhasesStateProps) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
        <Icon name="account_tree" size={32} className="text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No phases yet</h3>
      <p className="text-muted-foreground mb-4">
        Start building your workflow by adding a phase
      </p>
      <Button onClick={onAddPhase} className="gap-2">
        <Icon name="add" size={16} />
        Add First Phase
      </Button>
    </div>
  );
});

// ============================================================================
// Main Component (wraps with provider)
// ============================================================================

export const WorkflowEditor = memo(function WorkflowEditor({
  workflow,
  onSave,
  className,
}: WorkflowEditorProps) {
  return (
    <WorkflowEditorProvider initialWorkflow={workflow}>
      <WorkflowEditorInner onSave={onSave} className={className} />
    </WorkflowEditorProvider>
  );
});
