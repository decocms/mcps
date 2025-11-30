/**
 * Workflow Editor Store
 *
 * Single source of truth for workflow editing.
 * Manages workflow data, step editing, and all UI state.
 *
 * @see docs/ZUSTAND_BEST_PRACTICES.md
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { createStore, useStore } from "zustand";
import type { Phase, Step, StepAction, Workflow } from "@/lib/workflow-types";
import { isCodeAction, type CodeAction } from "@/lib/workflow-types";

// ============================================================================
// Store Types
// ============================================================================

type StepEditorTab = "action" | "input" | "retry" | "store";

interface WorkflowEditorState {
  // Workflow data
  workflow: Workflow | null;
  originalWorkflow: Workflow | null;

  // Selection state
  selectedPhaseIndex: number | null;
  selectedStepIndex: number | null;

  // Phase UI state
  expandedPhases: Set<number>;

  // Step editor UI state
  stepEditorTab: StepEditorTab;
  stepEditorJsonValue: string;
  stepEditorJsonErrors: string[];
  stepEditorCodeValue: string;

  // Workflow state
  isDirty: boolean;
  isSaving: boolean;
  errors: string[];
}

interface WorkflowEditorActions {
  // Workflow actions
  setWorkflow: (workflow: Workflow) => void;
  updateWorkflowMetadata: (
    data: Partial<Pick<Workflow, "title" | "description">>,
  ) => void;
  resetWorkflow: () => void;

  // Phase actions
  addPhase: () => void;
  removePhase: (phaseIndex: number) => void;
  movePhase: (fromIndex: number, toIndex: number) => void;

  // Step actions
  addStep: (phaseIndex: number, step: Step) => void;
  updateStep: (phaseIndex: number, stepIndex: number, step: Step) => void;
  removeStep: (phaseIndex: number, stepIndex: number) => void;
  moveStep: (
    fromPhase: number,
    fromStep: number,
    toPhase: number,
    toStep: number,
  ) => void;

  // Selected step actions (edit the currently selected step)
  updateSelectedStepAction: (action: StepAction) => void;
  updateSelectedStepName: (name: string) => void;
  updateSelectedStepInput: (input: Record<string, unknown> | undefined) => void;
  updateSelectedStepRetry: (retry: Step["retry"]) => void;

  // Selection actions
  selectStep: (phaseIndex: number | null, stepIndex: number | null) => void;
  clearSelection: () => void;

  // Phase UI actions
  togglePhaseExpanded: (phaseIndex: number) => void;
  expandAllPhases: () => void;
  collapseAllPhases: () => void;

  // Step editor UI actions
  setStepEditorTab: (tab: StepEditorTab) => void;
  setStepEditorJsonValue: (value: string) => void;
  setStepEditorCodeValue: (value: string) => void;
  parseAndApplyStepJson: () => boolean;
  applyStepCode: () => boolean;
  syncStepEditorFromSelection: () => void;

  // Save state actions
  setSaving: (isSaving: boolean) => void;
  setErrors: (errors: string[]) => void;
  clearErrors: () => void;
  markClean: () => void;
}

type WorkflowEditorStore = WorkflowEditorState & {
  actions: WorkflowEditorActions;
};

// ============================================================================
// Helpers
// ============================================================================

const getSelectedStep = (state: WorkflowEditorState): Step | null => {
  const { workflow, selectedPhaseIndex, selectedStepIndex } = state;
  if (!workflow || selectedPhaseIndex === null || selectedStepIndex === null)
    return null;
  return workflow.steps[selectedPhaseIndex]?.[selectedStepIndex] ?? null;
};

const extractCodeFromStep = (step: Step | null): string => {
  if (!step || !isCodeAction(step.action)) return "";
  return (step.action as CodeAction).code;
};

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_STATE: WorkflowEditorState = {
  workflow: null,
  originalWorkflow: null,
  selectedPhaseIndex: null,
  selectedStepIndex: null,
  expandedPhases: new Set(),
  stepEditorTab: "action",
  stepEditorJsonValue: "",
  stepEditorJsonErrors: [],
  stepEditorCodeValue: "",
  isDirty: false,
  isSaving: false,
  errors: [],
};

// ============================================================================
// Store Factory
// ============================================================================

export const createWorkflowEditorStore = (initialWorkflow?: Workflow) => {
  const initialState: WorkflowEditorState = initialWorkflow
    ? {
        ...DEFAULT_STATE,
        workflow: structuredClone(initialWorkflow),
        originalWorkflow: structuredClone(initialWorkflow),
        expandedPhases: new Set(initialWorkflow.steps.map((_, i) => i)),
      }
    : DEFAULT_STATE;

  return createStore<WorkflowEditorStore>()((set, get) => ({
    ...initialState,

    actions: {
      // ========== Workflow actions ==========
      setWorkflow: (workflow) =>
        set({
          workflow: structuredClone(workflow),
          originalWorkflow: structuredClone(workflow),
          expandedPhases: new Set(workflow.steps.map((_, i) => i)),
          isDirty: false,
          selectedPhaseIndex: null,
          selectedStepIndex: null,
          stepEditorJsonValue: "",
          stepEditorCodeValue: "",
          stepEditorJsonErrors: [],
        }),

      updateWorkflowMetadata: (data) =>
        set((state) => {
          if (!state.workflow) return state;
          return {
            workflow: { ...state.workflow, ...data },
            isDirty: true,
          };
        }),

      resetWorkflow: () =>
        set((state) => ({
          workflow: state.originalWorkflow
            ? structuredClone(state.originalWorkflow)
            : null,
          isDirty: false,
          selectedPhaseIndex: null,
          selectedStepIndex: null,
          stepEditorJsonValue: "",
          stepEditorCodeValue: "",
          stepEditorJsonErrors: [],
          errors: [],
        })),

      // ========== Phase actions ==========
      addPhase: () =>
        set((state) => {
          if (!state.workflow) return state;
          const newPhases = [...state.workflow.steps, []];
          const newExpanded = new Set(state.expandedPhases);
          newExpanded.add(newPhases.length - 1);
          return {
            workflow: { ...state.workflow, steps: newPhases },
            expandedPhases: newExpanded,
            isDirty: true,
          };
        }),

      removePhase: (phaseIndex) =>
        set((state) => {
          if (!state.workflow) return state;
          const newPhases = state.workflow.steps.filter(
            (_, i) => i !== phaseIndex,
          );
          const newExpanded = new Set<number>();
          state.expandedPhases.forEach((i) => {
            if (i < phaseIndex) newExpanded.add(i);
            else if (i > phaseIndex) newExpanded.add(i - 1);
          });
          const clearSelection = state.selectedPhaseIndex === phaseIndex;
          return {
            workflow: { ...state.workflow, steps: newPhases },
            expandedPhases: newExpanded,
            isDirty: true,
            selectedPhaseIndex: clearSelection
              ? null
              : state.selectedPhaseIndex,
            selectedStepIndex: clearSelection ? null : state.selectedStepIndex,
            stepEditorJsonValue: clearSelection
              ? ""
              : state.stepEditorJsonValue,
            stepEditorCodeValue: clearSelection
              ? ""
              : state.stepEditorCodeValue,
          };
        }),

      movePhase: (fromIndex, toIndex) =>
        set((state) => {
          if (!state.workflow) return state;
          const newPhases = [...state.workflow.steps];
          const [removed] = newPhases.splice(fromIndex, 1);
          newPhases.splice(toIndex, 0, removed);
          return {
            workflow: { ...state.workflow, steps: newPhases },
            isDirty: true,
          };
        }),

      // ========== Step actions ==========
      addStep: (phaseIndex, step) =>
        set((state) => {
          if (!state.workflow) return state;
          const newPhases = state.workflow.steps.map((phase, i) =>
            i === phaseIndex ? [...phase, step] : phase,
          );
          const newStepIndex = newPhases[phaseIndex].length - 1;
          return {
            workflow: { ...state.workflow, steps: newPhases },
            isDirty: true,
            selectedPhaseIndex: phaseIndex,
            selectedStepIndex: newStepIndex,
            stepEditorJsonValue: JSON.stringify(step, null, 2),
            stepEditorCodeValue: extractCodeFromStep(step),
            stepEditorJsonErrors: [],
          };
        }),

      updateStep: (phaseIndex, stepIndex, step) =>
        set((state) => {
          if (!state.workflow) return state;
          const newPhases = state.workflow.steps.map((phase, pi) =>
            pi === phaseIndex
              ? phase.map((s, si) => (si === stepIndex ? step : s))
              : phase,
          );
          const isSelectedStep =
            state.selectedPhaseIndex === phaseIndex &&
            state.selectedStepIndex === stepIndex;
          return {
            workflow: { ...state.workflow, steps: newPhases },
            isDirty: true,
            stepEditorJsonValue: isSelectedStep
              ? JSON.stringify(step, null, 2)
              : state.stepEditorJsonValue,
            stepEditorCodeValue: isSelectedStep
              ? extractCodeFromStep(step)
              : state.stepEditorCodeValue,
          };
        }),

      removeStep: (phaseIndex, stepIndex) =>
        set((state) => {
          if (!state.workflow) return state;
          const newPhases = state.workflow.steps.map((phase, pi) =>
            pi === phaseIndex
              ? phase.filter((_, si) => si !== stepIndex)
              : phase,
          );
          const clearSelection =
            state.selectedPhaseIndex === phaseIndex &&
            state.selectedStepIndex === stepIndex;
          return {
            workflow: { ...state.workflow, steps: newPhases },
            isDirty: true,
            selectedPhaseIndex: clearSelection
              ? null
              : state.selectedPhaseIndex,
            selectedStepIndex: clearSelection ? null : state.selectedStepIndex,
            stepEditorJsonValue: clearSelection
              ? ""
              : state.stepEditorJsonValue,
            stepEditorCodeValue: clearSelection
              ? ""
              : state.stepEditorCodeValue,
          };
        }),

      moveStep: (fromPhase, fromStep, toPhase, toStep) =>
        set((state) => {
          if (!state.workflow) return state;
          const newPhases = state.workflow.steps.map((phase) => [...phase]);
          const [removed] = newPhases[fromPhase].splice(fromStep, 1);
          newPhases[toPhase].splice(toStep, 0, removed);
          return {
            workflow: { ...state.workflow, steps: newPhases },
            isDirty: true,
          };
        }),

      // ========== Selected step actions ==========
      updateSelectedStepAction: (action) =>
        set((state) => {
          const { workflow, selectedPhaseIndex, selectedStepIndex } = state;
          if (
            !workflow ||
            selectedPhaseIndex === null ||
            selectedStepIndex === null
          )
            return state;
          const newPhases = workflow.steps.map((phase, pi) =>
            pi === selectedPhaseIndex
              ? phase.map((s, si) =>
                  si === selectedStepIndex ? { ...s, action } : s,
                )
              : phase,
          );
          const newStep = newPhases[selectedPhaseIndex][selectedStepIndex];
          return {
            workflow: { ...workflow, steps: newPhases },
            isDirty: true,
            stepEditorJsonValue: JSON.stringify(newStep, null, 2),
            stepEditorCodeValue: isCodeAction(action)
              ? (action as CodeAction).code
              : state.stepEditorCodeValue,
          };
        }),

      updateSelectedStepName: (name) =>
        set((state) => {
          const { workflow, selectedPhaseIndex, selectedStepIndex } = state;
          if (
            !workflow ||
            selectedPhaseIndex === null ||
            selectedStepIndex === null
          )
            return state;
          const newPhases = workflow.steps.map((phase, pi) =>
            pi === selectedPhaseIndex
              ? phase.map((s, si) =>
                  si === selectedStepIndex ? { ...s, name } : s,
                )
              : phase,
          );
          const newStep = newPhases[selectedPhaseIndex][selectedStepIndex];
          return {
            workflow: { ...workflow, steps: newPhases },
            isDirty: true,
            stepEditorJsonValue: JSON.stringify(newStep, null, 2),
          };
        }),

      updateSelectedStepInput: (input) =>
        set((state) => {
          const { workflow, selectedPhaseIndex, selectedStepIndex } = state;
          if (
            !workflow ||
            selectedPhaseIndex === null ||
            selectedStepIndex === null
          )
            return state;
          const newPhases = workflow.steps.map((phase, pi) =>
            pi === selectedPhaseIndex
              ? phase.map((s, si) =>
                  si === selectedStepIndex ? { ...s, input } : s,
                )
              : phase,
          );
          const newStep = newPhases[selectedPhaseIndex][selectedStepIndex];
          return {
            workflow: { ...workflow, steps: newPhases },
            isDirty: true,
            stepEditorJsonValue: JSON.stringify(newStep, null, 2),
          };
        }),

      updateSelectedStepRetry: (retry) =>
        set((state) => {
          const { workflow, selectedPhaseIndex, selectedStepIndex } = state;
          if (
            !workflow ||
            selectedPhaseIndex === null ||
            selectedStepIndex === null
          )
            return state;
          const newPhases = workflow.steps.map((phase, pi) =>
            pi === selectedPhaseIndex
              ? phase.map((s, si) =>
                  si === selectedStepIndex ? { ...s, retry } : s,
                )
              : phase,
          );
          const newStep = newPhases[selectedPhaseIndex][selectedStepIndex];
          return {
            workflow: { ...workflow, steps: newPhases },
            isDirty: true,
            stepEditorJsonValue: JSON.stringify(newStep, null, 2),
          };
        }),

      // ========== Selection actions ==========
      selectStep: (phaseIndex, stepIndex) => {
        const state = get();
        const step =
          phaseIndex !== null && stepIndex !== null && state.workflow
            ? (state.workflow.steps[phaseIndex]?.[stepIndex] ?? null)
            : null;
        set({
          selectedPhaseIndex: phaseIndex,
          selectedStepIndex: stepIndex,
          stepEditorJsonValue: step ? JSON.stringify(step, null, 2) : "",
          stepEditorCodeValue: extractCodeFromStep(step),
          stepEditorJsonErrors: [],
        });
      },

      clearSelection: () =>
        set({
          selectedPhaseIndex: null,
          selectedStepIndex: null,
          stepEditorJsonValue: "",
          stepEditorCodeValue: "",
          stepEditorJsonErrors: [],
        }),

      // ========== Phase UI actions ==========
      togglePhaseExpanded: (phaseIndex) =>
        set((state) => {
          const newExpanded = new Set(state.expandedPhases);
          if (newExpanded.has(phaseIndex)) {
            newExpanded.delete(phaseIndex);
          } else {
            newExpanded.add(phaseIndex);
          }
          return { expandedPhases: newExpanded };
        }),

      expandAllPhases: () =>
        set((state) => ({
          expandedPhases: new Set(state.workflow?.steps.map((_, i) => i) ?? []),
        })),

      collapseAllPhases: () => set({ expandedPhases: new Set() }),

      // ========== Step editor UI actions ==========
      setStepEditorTab: (tab) => set({ stepEditorTab: tab }),

      setStepEditorJsonValue: (value) =>
        set({ stepEditorJsonValue: value, stepEditorJsonErrors: [] }),

      setStepEditorCodeValue: (value) => set({ stepEditorCodeValue: value }),

      parseAndApplyStepJson: () => {
        const state = get();
        const {
          stepEditorJsonValue,
          selectedPhaseIndex,
          selectedStepIndex,
          workflow,
        } = state;

        if (
          !workflow ||
          selectedPhaseIndex === null ||
          selectedStepIndex === null
        ) {
          set({ stepEditorJsonErrors: ["No step selected"] });
          return false;
        }

        try {
          const parsed = JSON.parse(stepEditorJsonValue);

          if (!parsed.name || typeof parsed.name !== "string") {
            set({ stepEditorJsonErrors: ["Step must have a name"] });
            return false;
          }
          if (!parsed.action || typeof parsed.action !== "object") {
            set({ stepEditorJsonErrors: ["Step must have an action"] });
            return false;
          }

          const newPhases = workflow.steps.map((phase, pi) =>
            pi === selectedPhaseIndex
              ? phase.map((s, si) =>
                  si === selectedStepIndex ? (parsed as Step) : s,
                )
              : phase,
          );

          set({
            workflow: { ...workflow, steps: newPhases },
            isDirty: true,
            stepEditorJsonErrors: [],
            stepEditorCodeValue: extractCodeFromStep(parsed as Step),
          });
          return true;
        } catch (e) {
          set({
            stepEditorJsonErrors: [
              e instanceof Error ? e.message : "Invalid JSON",
            ],
          });
          return false;
        }
      },

      applyStepCode: () => {
        const state = get();
        const {
          stepEditorCodeValue,
          selectedPhaseIndex,
          selectedStepIndex,
          workflow,
        } = state;

        if (
          !workflow ||
          selectedPhaseIndex === null ||
          selectedStepIndex === null
        ) {
          return false;
        }

        const currentStep =
          workflow.steps[selectedPhaseIndex]?.[selectedStepIndex];
        if (!currentStep) return false;

        const newStep: Step = {
          ...currentStep,
          action: { code: stepEditorCodeValue },
        };

        const newPhases = workflow.steps.map((phase, pi) =>
          pi === selectedPhaseIndex
            ? phase.map((s, si) => (si === selectedStepIndex ? newStep : s))
            : phase,
        );

        set({
          workflow: { ...workflow, steps: newPhases },
          isDirty: true,
          stepEditorJsonValue: JSON.stringify(newStep, null, 2),
        });
        return true;
      },

      syncStepEditorFromSelection: () => {
        const state = get();
        const step = getSelectedStep(state);
        set({
          stepEditorJsonValue: step ? JSON.stringify(step, null, 2) : "",
          stepEditorCodeValue: extractCodeFromStep(step),
          stepEditorJsonErrors: [],
        });
      },

      // ========== Save state actions ==========
      setSaving: (isSaving) => set({ isSaving }),
      setErrors: (errors) => set({ errors }),
      clearErrors: () => set({ errors: [], stepEditorJsonErrors: [] }),
      markClean: () =>
        set((state) => ({
          isDirty: false,
          originalWorkflow: state.workflow
            ? structuredClone(state.workflow)
            : null,
        })),
    },
  }));
};

// ============================================================================
// React Context
// ============================================================================

type WorkflowEditorStoreApi = ReturnType<typeof createWorkflowEditorStore>;

const WorkflowEditorStoreContext = createContext<WorkflowEditorStoreApi | null>(
  null,
);

interface WorkflowEditorProviderProps {
  children: ReactNode;
  initialWorkflow?: Workflow;
}

export function WorkflowEditorProvider({
  children,
  initialWorkflow,
}: WorkflowEditorProviderProps) {
  const [store] = useState(() => createWorkflowEditorStore(initialWorkflow));

  return (
    <WorkflowEditorStoreContext.Provider value={store}>
      {children}
    </WorkflowEditorStoreContext.Provider>
  );
}

// ============================================================================
// Base Hook
// ============================================================================

function useWorkflowEditorStore<T>(
  selector: (state: WorkflowEditorStore) => T,
): T {
  const store = useContext(WorkflowEditorStoreContext);
  if (!store) {
    throw new Error(
      "useWorkflowEditorStore must be used within WorkflowEditorProvider",
    );
  }
  return useStore(store, selector);
}

// ============================================================================
// Workflow Hooks
// ============================================================================

export const useWorkflow = () => useWorkflowEditorStore((s) => s.workflow);
export const useOriginalWorkflow = () =>
  useWorkflowEditorStore((s) => s.originalWorkflow);
export const useIsDirty = () => useWorkflowEditorStore((s) => s.isDirty);
export const useIsSaving = () => useWorkflowEditorStore((s) => s.isSaving);
export const useErrors = () => useWorkflowEditorStore((s) => s.errors);

// ============================================================================
// Selection Hooks
// ============================================================================

export const useSelectedPhaseIndex = () =>
  useWorkflowEditorStore((s) => s.selectedPhaseIndex);
export const useSelectedStepIndex = () =>
  useWorkflowEditorStore((s) => s.selectedStepIndex);

export const useSelectedStep = (): Step | null => {
  const workflow = useWorkflow();
  const phaseIndex = useSelectedPhaseIndex();
  const stepIndex = useSelectedStepIndex();
  if (!workflow || phaseIndex === null || stepIndex === null) return null;
  return workflow.steps[phaseIndex]?.[stepIndex] ?? null;
};

export const useIsStepSelected = (
  phaseIndex: number,
  stepIndex: number,
): boolean => {
  const selectedPhase = useSelectedPhaseIndex();
  const selectedStep = useSelectedStepIndex();
  return selectedPhase === phaseIndex && selectedStep === stepIndex;
};

// ============================================================================
// Phase Hooks
// ============================================================================

export const useExpandedPhases = () =>
  useWorkflowEditorStore((s) => s.expandedPhases);
export const useIsPhaseExpanded = (phaseIndex: number) =>
  useWorkflowEditorStore((s) => s.expandedPhases.has(phaseIndex));
export const usePhaseCount = (): number => {
  const workflow = useWorkflow();
  return workflow?.steps.length ?? 0;
};
export const usePhase = (phaseIndex: number): Phase | null => {
  const workflow = useWorkflow();
  return workflow?.steps[phaseIndex] ?? null;
};

// ============================================================================
// Step Hooks
// ============================================================================

export const useStepCount = (): number => {
  const workflow = useWorkflow();
  if (!workflow) return 0;
  return workflow.steps.reduce((acc, phase) => acc + phase.length, 0);
};

export const useStep = (phaseIndex: number, stepIndex: number): Step | null => {
  const workflow = useWorkflow();
  return workflow?.steps[phaseIndex]?.[stepIndex] ?? null;
};

// ============================================================================
// Step Editor Hooks
// ============================================================================

export const useStepEditorTab = () =>
  useWorkflowEditorStore((s) => s.stepEditorTab);
export const useStepEditorJsonValue = () =>
  useWorkflowEditorStore((s) => s.stepEditorJsonValue);
export const useStepEditorJsonErrors = () =>
  useWorkflowEditorStore((s) => s.stepEditorJsonErrors);
export const useStepEditorCodeValue = () =>
  useWorkflowEditorStore((s) => s.stepEditorCodeValue);

export const useSelectedStepRetry = (): Step["retry"] => {
  const step = useSelectedStep();
  return step?.retry;
};

// ============================================================================
// Actions Hook
// ============================================================================

export const useWorkflowEditorActions = () =>
  useWorkflowEditorStore((s) => s.actions);

// Re-export context
export { WorkflowEditorStoreContext };
