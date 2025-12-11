import {
  StepType,
  useIsDirty,
  useTrackingExecutionId,
  useWorkflow,
  useWorkflowActions,
  useWorkflowSteps,
} from "@/web/stores/workflow";
import {
  SleepAction,
  WaitForSignalAction,
  WorkflowExecutionStepResult,
  WorkflowExecutionStreamChunk,
} from "@decocms/bindings/workflow";
import { useWorkflowBindingConnection } from "@/web/hooks/workflows/use-workflow-binding-connection";
import {
  BellIcon,
  CheckIcon,
  ClockIcon,
  CodeXml,
  Play,
  Settings,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { Step } from "@decocms/bindings/workflow";
import { ToolCallAction } from "@decocms/bindings/workflow";
import { CodeAction } from "@decocms/bindings/workflow";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { createContext, useContext, useLayoutEffect } from "react";



function MarchingAntsBorder({
  className,
  color,
  enabled,
}: {
  className?: string;
  color: string;
  enabled: boolean;
}) {
  return (
    <svg
      className={`absolute inset-0 w-full h-full pointer-events-none ${
        className ?? ""
      }`}
      preserveAspectRatio="none"
    >
      <rect
        x="1"
        y="1"
        width="calc(100% - 2px)"
        height="calc(100% - 2px)"
        rx="6"
        ry="6"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray="12 14"
        className={enabled ? "marching-ants-stroke" : ""}
      />
    </svg>
  );
}
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@deco/ui/components/card.tsx";
import { cn } from "@deco/ui/lib/utils.js";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import { ScrollArea } from "@deco/ui/components/scroll-area.tsx";
import { useScrollFade } from "../selectable-list";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useToolCallMutation } from "@/web/hooks/use-tool-call";
import { createToolCaller } from "@/tools/client";
import { useStreamWorkflowExecution } from "../details/workflow-execution";

type StepPosition = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  centerX: number;
  centerY: number;
};

type StepPositionsContextType = {
  positions: Map<string, StepPosition>;
  registerStep: (name: string, element: HTMLElement | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

const StepPositionsContext = createContext<StepPositionsContextType | null>(null);

function useStepPositions() {
  const ctx = useContext(StepPositionsContext);
  if (!ctx) throw new Error("useStepPositions must be used within StepPositionsProvider");
  return ctx;
}

function StepPositionsProvider({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const elementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [positions, setPositions] = useState<Map<string, StepPosition>>(new Map());

  const updatePositions = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    
    const newPositions = new Map<string, StepPosition>();
    elementsRef.current.forEach((element, name) => {
      const rect = element.getBoundingClientRect();
      newPositions.set(name, {
        top: rect.top - containerRect.top,
        bottom: rect.bottom - containerRect.top,
        left: rect.left - containerRect.left,
        right: rect.right - containerRect.left,
        centerX: rect.left - containerRect.left + rect.width / 2,
        centerY: rect.top - containerRect.top + rect.height / 2,
      });
    });
    setPositions(newPositions);
  }, []);

  const registerStep = useCallback((name: string, element: HTMLElement | null) => {
    if (element) {
      elementsRef.current.set(name, element);
    } else {
      elementsRef.current.delete(name);
    }
    // Defer position update to next frame
    requestAnimationFrame(updatePositions);
  }, [updatePositions]);

  // Update positions on resize
  useLayoutEffect(() => {
    const observer = new ResizeObserver(updatePositions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [updatePositions]);

  return (
    <StepPositionsContext.Provider value={{ positions, registerStep, containerRef }}>
      {children}
    </StepPositionsContext.Provider>
  );
}

// ============================================
// CONNECTION LINES SVG COMPONENT
// ============================================

function ConnectionLines({ steps }: { steps: Step[] }) {
  const { positions } = useStepPositions();
  const stepNames = useMemo(() => new Set(steps.map(s => s.name)), [steps]);
  
  // Build edges: [fromStep, toStep][]
  const edges = useMemo(() => {
    const result: [string, string][] = [];
    for (const step of steps) {
      const deps = getStepDependencies(step, stepNames);
      for (const dep of deps) {
        result.push([dep, step.name]);
      }
    }
    return result;
  }, [steps, stepNames]);

  // Count connections per step for offset calculation
  const connectionCounts = useMemo(() => {
    const outgoing = new Map<string, string[]>(); // step -> [targets]
    const incoming = new Map<string, string[]>(); // step -> [sources]
    
    for (const [from, to] of edges) {
      if (!outgoing.has(from)) outgoing.set(from, []);
      if (!incoming.has(to)) incoming.set(to, []);
      outgoing.get(from)!.push(to);
      incoming.get(to)!.push(from);
    }
    
    return { outgoing, incoming };
  }, [edges]);

  // Generate SVG paths with offsets
  const paths = useMemo(() => {
    const { outgoing, incoming } = connectionCounts;
    
    return edges.map(([from, to]) => {
      const fromPos = positions.get(from);
      const toPos = positions.get(to);
      if (!fromPos || !toPos) return null;

      // Calculate offset for this specific connection
      const outgoingTargets = outgoing.get(from) || [];
      const incomingSources = incoming.get(to) || [];
      
      const outIdx = outgoingTargets.indexOf(to);
      const outCount = outgoingTargets.length;
      const inIdx = incomingSources.indexOf(from);
      const inCount = incomingSources.length;
      
      // Spread offset: distribute connections across width
      const spreadWidth = Math.min(fromPos.right - fromPos.left - 20, 60);
      const outOffset = outCount > 1 
        ? (outIdx - (outCount - 1) / 2) * (spreadWidth / Math.max(outCount - 1, 1))
        : 0;
      
      const inSpreadWidth = Math.min(toPos.right - toPos.left - 20, 60);
      const inOffset = inCount > 1
        ? (inIdx - (inCount - 1) / 2) * (inSpreadWidth / Math.max(inCount - 1, 1))
        : 0;

      // Start from bottom of source (with offset)
      const startX = fromPos.centerX + outOffset;
      const startY = fromPos.bottom;
      
      // End at top of target (with offset)
      const endX = toPos.centerX + inOffset;
      const endY = toPos.top;

      const deltaY = endY - startY;
      const deltaX = endX - startX;
      
      // Smarter control points:
      // - First control point goes straight down from start
      // - Second control point comes straight down into end
      // This creates cleaner parallel-ish lines
      const verticalGap = Math.max(deltaY * 0.35, 30);
      
      const cp1X = startX;
      const cp1Y = startY + verticalGap;
      const cp2X = endX;
      const cp2Y = endY - verticalGap;

      const d = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;

      return { key: `${from}-${to}`, d };
    }).filter(Boolean);
  }, [edges, positions, connectionCounts]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
      style={{ zIndex: 0 }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="6"
          markerHeight="5"
          refX="6"
          refY="2.5"
          orient="auto"
        >
          <polygon 
            points="0 0, 6 2.5, 0 5" 
            fill="currentColor" 
            className="text-muted-foreground/60" 
          />
        </marker>
      </defs>
      {paths.map((path) => (
        <path
          key={path!.key}
          d={path!.d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-muted-foreground/40"
          markerEnd="url(#arrowhead)"
        />
      ))}
    </svg>
  );
}

// ============================================
// HOOK FOR STEP CARDS TO REGISTER THEMSELVES
// ============================================

function useRegisterStep(stepName: string) {
  const { registerStep } = useStepPositions();
  const ref = useCallback(
    (element: HTMLElement | null) => {
      registerStep(stepName, element);
    },
    [registerStep, stepName]
  );
  return ref;
}

// ============================================
// UPDATED WorkflowSteps - wrap with provider
// ============================================

export function WorkflowSteps() {
  const steps = useWorkflowSteps();
  const trackingExecutionId = useTrackingExecutionId();
  const stepsByLevel = useMemo(() => groupStepsByLevel(steps), [steps]);

  return (
    <StepPositionsProvider>
      <WorkflowStepsInner
        steps={steps}
        stepsByLevel={stepsByLevel}
        trackingExecutionId={trackingExecutionId ?? null}
      />
    </StepPositionsProvider>
  );
}

function WorkflowStepsInner({
  steps,
  stepsByLevel,
  trackingExecutionId,
}: {
  steps: Step[];
  stepsByLevel: Step[][];
  trackingExecutionId: string | null;
}) {
  const { containerRef } = useStepPositions();

  return (
    <div ref={containerRef} className="flex flex-col gap-2 h-full w-full relative">
      {/* SVG connection lines layer */}
      <ConnectionLines steps={steps} />
      
      <WorkflowTrigger />
      <FlowLine showContinueLine={stepsByLevel.length > 0} index={0} />
      
      {stepsByLevel.map((levelSteps, levelIndex) => (
        <div
          key={`level-${levelIndex}`}
          className="flex flex-col gap-2 h-full bg-transparent relative z-10"
        >
          <div className="flex items-center justify-center gap-2 h-full bg-transparent">
            {levelSteps.map((step, stepIndex) => {
              const isForEach = false; // !!step.config?.forEach && !!trackingExecutionId;
              return isForEach ? (
                <ForEachStep key={step.name + stepIndex} step={step} />
              ) : (
                <StepByType key={step.name} step={step} action={step.action} />
              );
            })}
          </div>
          
          <FlowLine
            showContinueLine={levelIndex < stepsByLevel.length - 1}
            index={levelIndex}
          />
        </div>
      ))}
    </div>
  );
}

export function getStepResults(
  stepName: string,
  allResults: WorkflowExecutionStepResult[] | undefined,
  allChunks?: WorkflowExecutionStreamChunk[],
): WorkflowExecutionStepResult[] {
  if (!allResults) return [];

  if (allChunks) {
    const chunks = allChunks.filter((chunk) => chunk.step_id === stepName);
    const output = chunks.map((chunk) => chunk.chunk_data);

    return [
      {
        step_id: stepName,
        input: {},
        output,
        completed_at_epoch_ms: Date.now(),
        id: stepName,
        title: stepName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        execution_id: stepName,
        created_by: "system",
        updated_by: "system",
      },
    ];
  }
  // Match both exact name and forEach iterations like "stepName[0]", "stepName[1]", etc.
  const pattern = new RegExp(`^${stepName}(\\[\\d+\\])?$`);
  return allResults.filter((result) => pattern.test(result.step_id));
}

function useWorkflowStart() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const { setTrackingExecutionId } = useWorkflowActions();
  const toolCaller = useMemo(
    () => createToolCaller(connectionId),
    [connectionId],
  );
  const workflow = useWorkflow();
  const { mutateAsync: startWorkflow, isPending: isWorkflowStartPending } =
    useToolCallMutation({
      toolCaller,
      toolName: "WORKFLOW_START",
    });
  const handleRunWorkflow = async () => {
    const result = await startWorkflow({
      workflowId: workflow.id,
      input: {},
    });
    const executionId = (result as { executionId: string }).executionId ??
      (result as { structuredContent: { executionId: string } })
        .structuredContent.executionId;
    setTrackingExecutionId(executionId);
  };
  return { handleRunWorkflow, isWorkflowStartPending };
}

function WorkflowTrigger() {
  const { handleRunWorkflow, isWorkflowStartPending } = useWorkflowStart();
  const isDirty = useIsDirty();
  const steps = useWorkflowSteps();
  const workflowConnectionId = useWorkflowBindingConnection();
  const manualTriggerStep = useMemo(
    () => steps.find((step) => step.name === "Manual"),
    [steps],
  );
  const trackingExecutionId = useTrackingExecutionId();
  const { isPending } = useStreamWorkflowExecution(trackingExecutionId);
  const isRunning = useMemo(() => {
    return isPending && !!trackingExecutionId;
  }, [isPending, trackingExecutionId]);
  console.log({isRunning});
  const triggerIcon = useMemo(() => {
    return isRunning
      ? <Spinner size="xs" />
      : (
        <Button
        disabled={isDirty || isRunning}
        variant="ghost" size="xs" onClick={() => handleRunWorkflow()}>
          <Play className="w-4 h-4 text-foreground cursor-pointer hover:text-primary transition-colors" />
        </Button>
      );
  }, [isWorkflowStartPending, isDirty, isRunning]);
  const { isFetched } = useStepResults();

  return (
    <div>
      <div
        className="bg-muted border-border text-muted-foreground h-5 flex items-center gap-1 border px-2 py-1 rounded-t-md w-fit ml-2 border-b-0"
      >
        <Zap size={13} className="text-muted-foreground block" />
        <span className="uppercase font-normal font-mono text-xs leading-3 text-muted-foreground block mt-px">
          Trigger
        </span>
      </div>
      <StepCard
        style={isFetched ? "success" : undefined}
        icon={triggerIcon}
        iconBgColor="invisible"
        step={manualTriggerStep ?? {
          name: "Manual",
          action: {
            toolName: "WORKFLOW_START",
            connectionId: workflowConnectionId.id,
          },
        }}
      />
    </div>
  );
}

function ForEachStep({ step }: { step: Step }) {
  const [isHovering, setIsHovering] = useState(false);
  const handleMouseEnter = () => {
    setIsHovering(true);
  };
  const handleMouseLeave = () => {
    setIsHovering(false);
  };
  const scroll = useScrollFade();
  const trackingExecutionId = useTrackingExecutionId();
  const { data, isLoading } = useStreamWorkflowExecution(trackingExecutionId);
  const { isFetching } = useStepResults();
  const stepResults = getStepResults(
    step.name,
    data?.item?.step_results,
    data?.item?.stream_chunks,
  );
  return (
    <div
      className="rounded-md px-3 pt-4 relative h-full bg-transparent"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {
        <MarchingAntsBorder
          enabled={isLoading}
          color={isHovering ? "#CCC" : "#D8D8D8"}
        />
      }
      <span
        className={cn(
          "text-base text-muted-foreground absolute -top-[12px] left-3 p-0 bg-background",
        )}
      >
        Loop
      </span>
      <ScrollArea
        hideScrollbar
        className="max-h-[200px]"
        contentClassName="gap-2"
        ref={scroll.ref}
        onScroll={scroll.onScroll}
        style={scroll.showFade
          ? {
            maskImage:
              "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)",
          }
          : undefined}
      >
        {stepResults.map((result, index) => (
          <div
            key={result.step_id}
            className={cn(
              "cursor-pointer",
              index === stepResults.length - 1 && "pb-2",
            )}
          >
            <StepCard
              style={isFetching ? "pending" : "success"}
              step={{ ...step, name: result.step_id }}
              icon={
                <div className="h-8 w-8 bg-primary text-primary-foreground flex items-center justify-center rounded-lg">
                  <CodeXml className="w-4 h-4" />
                </div>
              }
            />
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}

function useStepResults() {
  const steps = useWorkflowSteps();
  const trackingExecutionId = useTrackingExecutionId();
  const {
    data,
    isLoading,
    isFetching,
    isFetched,
    refetch: refetchWorkflowExecution,
  } = useStreamWorkflowExecution(
    trackingExecutionId,
  );

  const stepResults = useMemo(() => {
    return steps.map((step) =>
      getStepResults(step.name, data?.item?.step_results)
    );
  }, [steps, data?.item?.step_results]);
  const firstPendingStep = useMemo(() => {
    const firstPendingStep = stepResults
      .flat()
      .findLast((r) => !r.output)?.step_id;
    return firstPendingStep; // -1 if all steps have results
  }, [stepResults]);
  const isFinished = useMemo(() => {
    return data?.item?.status === "completed" ||
      data?.item?.status === "cancelled";
  }, [data?.item?.status]);

  const hasOutput = useCallback((stepName: string) => {
    return stepResults.flat().findLast((s) => s.step_id === stepName)?.output;
  }, [stepResults]);

  return {
    stepResults,
    firstPendingStep,
    isFetching,
    isFetched,
    isLoading,
    isFinished,
    hasOutput,
    refetchWorkflowExecution,
  };
}

function getAllRefs(input: unknown): string[] {
  const refs: string[] = [];
  
  function traverse(value: unknown) {
    if (typeof value === "string") {
      const matches = value.match(/@(\w+)/g);
      if (matches) {
        refs.push(...matches.map(m => m.substring(1))); // Remove @ prefix
      }
    } else if (Array.isArray(value)) {
      value.forEach(traverse);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(traverse);
    }
  }
  
  traverse(input);
  return [...new Set(refs)].sort(); // Dedupe and sort for consistent grouping
}

// Add this function to get the dependency signature for grouping
function getRefSignature(step: Step): string {
  const inputRefs = getAllRefs(step.input);
  const forEachRefs = step.config?.forEach?.items 
    ? getAllRefs(step.config.forEach.items) 
    : [];
  const allRefs = [...new Set([...inputRefs, ...forEachRefs])].sort();
  return allRefs.join(",");
}

function getStepDependencies(step: Step, allStepNames: Set<string>): string[] {
  const deps: string[] = [];
  
  function traverse(value: unknown) {
    if (typeof value === "string") {
      // Match @stepName or @stepName.something patterns
      const matches = value.match(/@(\w+)/g);
      if (matches) {
        for (const match of matches) {
          const refName = match.substring(1); // Remove @
          // Only count as dependency if it references another step (not "item" from forEach)
          if (allStepNames.has(refName)) {
            deps.push(refName);
          }
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(traverse);
    } else if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(traverse);
    }
  }
  
  traverse(step.input);
  if (step.config?.forEach?.items) {
    traverse(step.config.forEach.items);
  }
  
  return [...new Set(deps)];
}

// Compute topological levels for all steps
function computeStepLevels(steps: Step[]): Map<string, number> {
  const stepNames = new Set(steps.map(s => s.name));
  const levels = new Map<string, number>();
  
  // Build dependency map
  const depsMap = new Map<string, string[]>();
  for (const step of steps) {
    depsMap.set(step.name, getStepDependencies(step, stepNames));
  }
  
  // Compute level for each step (with memoization)
  function getLevel(stepName: string, visited: Set<string>): number {
    if (levels.has(stepName)) return levels.get(stepName)!;
    if (visited.has(stepName)) return 0; // Cycle detection, shouldn't happen
    
    visited.add(stepName);
    const deps = depsMap.get(stepName) || [];
    
    if (deps.length === 0) {
      levels.set(stepName, 0);
      return 0;
    }
    
    const maxDepLevel = Math.max(...deps.map(d => getLevel(d, visited)));
    const level = maxDepLevel + 1;
    levels.set(stepName, level);
    return level;
  }
  
  for (const step of steps) {
    getLevel(step.name, new Set());
  }
  
  return levels;
}

// Group steps by their computed level
function groupStepsByLevel(steps: Step[]): Step[][] {
  const levels = computeStepLevels(steps);
  const maxLevel = Math.max(...Array.from(levels.values()), -1);
  
  const grouped: Step[][] = [];
  for (let level = 0; level <= maxLevel; level++) {
    const stepsAtLevel = steps.filter(s => levels.get(s.name) === level);
    if (stepsAtLevel.length > 0) {
      grouped.push(stepsAtLevel);
    }
  }
  
  return grouped;
}

function useStepResult(stepName: string) {
  const { stepResults, isFetching } = useStepResults();
  const stepResult = useMemo(() => {
    return stepResults.flat().findLast((r) => r.step_id === stepName);
  }, [stepResults, stepName]);
  return { stepResult, isFetching };
}

function useSendSignal() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const toolCaller = useMemo(
    () => createToolCaller(connectionId),
    [connectionId],
  );
  const { refetchWorkflowExecution } = useStepResults();
  const trackingExecutionId = useTrackingExecutionId();
  const { mutateAsync: sendSignal, isPending: isSendSignalPending } =
    useToolCallMutation({
      toolCaller,
      toolName: "SEND_SIGNAL",
    });
  const handleSendSignal = async ({
    signalName,
    payload,
  }: {
    signalName: string;
    payload: unknown;
  }) => {
    const executionId = trackingExecutionId;
    await sendSignal({
      executionId,
      signalName,
      payload,
    }, {
      onSuccess: (data) => {
        refetchWorkflowExecution();
      },
    });
  };
  return { handleSendSignal, isSendSignalPending };
}

function SignalStep(
  { step }: { step: Step & { action: WaitForSignalAction } },
) {
  const { hasOutput } = useStepResults();
  const isConsumed = hasOutput(step.name);
  const { handleSendSignal } = useSendSignal();
  const trackingExecutionId = useTrackingExecutionId();

  const handleClick = () => {
    if (!isConsumed) {
      handleSendSignal({ signalName: step.action.signalName, payload: {} });
    }
  };
  return (
    <StepCard
      step={step}
      icon={isConsumed
        ? <CheckIcon className="w-4 h-4 text-primary-foreground" />
        : (
          <BellIcon className="w-4 h-4 text-primary-foreground cursor-pointer" />
        )}
      style={isConsumed
        ? "success"
        : trackingExecutionId
        ? "waiting_for_signal"
        : undefined}
      action={handleClick}
    />
  );
}

function findAnyRef(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const keys = Object.keys(input);
  for (const key of keys) {
    if (typeof input[key as keyof typeof input] === "string" && (input[key as keyof typeof input] as string).includes("@")) {
      return (input[key as keyof typeof input] as string);
    }
    if (typeof input[key as keyof typeof input] === "object" && input[key as keyof typeof input] !== null && findAnyRef(input[key as keyof typeof input])) {
      return (input[key as keyof typeof input] as string);
    }
  }
  return undefined;
}

function getRefTags(input: string): string[] {
  console.log({input});
  const matches = input?.match(/@(\w+)/g); 
  console.log({matches});
  if (!matches) return [];
  return matches.map((match) => match.replace("@ref(", "").replace(")", ""));
}


function StepByType({
  step,
  action,
}: {
  step: Step;
  action: ToolCallAction | CodeAction | SleepAction | WaitForSignalAction;
}) {
  const anyRef = useMemo(() => findAnyRef(step.input), [step.input]);
  const refTags = useMemo(() => anyRef ? getRefTags(JSON.stringify(anyRef)) : [], [anyRef]);
  return (
    <>
      {"toolName" in action && (
        <StepCard
          step={step as Step & { action: ToolCallAction }}
          icon={<Wrench className="w-4 h-4" />}
        />
      )}
      {"code" in action && (
        <StepCard
          step={step as Step & { action: CodeAction }}
          icon={<CodeXml className="w-4 h-4" />}
        />
      )}
      {("sleepMs" in action || "sleepUntil" in action) && (
        <StepCard
          step={step}
          icon={<ClockIcon className="w-4 h-4 text-primary-foreground" />}
        />
      )}
      {"signalName" in action && (
        <SignalStep step={step as Step & { action: WaitForSignalAction }} />
      )}
    </>
  );
}

function NewStepButton({ index }: { index: number }) {
  const [isCreatingStep, setIsCreatingStep] = useState(false);

  const { isFinished } = useStepResults();
  const trackingExecutionId = useTrackingExecutionId();

  // const isDisabled = !isFinished && !!trackingExecutionId;
  // const isDisabled = true;
  const isDisabled = false;
  return (
    <div className="flex flex-col items-center justify-center transition-all ease-in-out group">
      <div
        className={cn(
          "h-0 w-0.5 bg-border transition-all ease-in-out mb-2",
          isDisabled && "mb-0 h-2",
        )}
      />
<div className={cn("min-w-6 h-6 rounded-lg border border-primary transition-all ease-in-out cursor-pointer"
  
  , "group-hover:bg-primary/40"
  // ,isCreatingStep && "group-hover:bg-primary/40"

)

}
  
  >
  <div className="w-full h-full flex items-center justify-center">
    <div
      className={cn(
        "transition-all duration-200 ease-in-out flex items-center justify-center w-full h-full",
        isDisabled && "scale-0 opacity-0",
      )}
    >
      <div
        className={cn(
          "absolute transition-all duration-200 ease-in-out flex items-center justify-center w-full h-full",
          isCreatingStep && "scale-0 opacity-0 pointer-events-none",
        )}
      >
        <button
          type="button"
          onClick={() => setIsCreatingStep(true)}
          className="bg-transparent peer rounded-lg flex items-center justify-center cursor-pointer new-step-button transition-all ease-in-out"
        >
          <Plus className="w-4 h-4 text-primary-foreground transition-all ease-in-out" />
        </button>
      </div>

      <div
        className={cn(
          "absolute transition-all duration-200 ease-in-out",
          !isCreatingStep && "scale-0 opacity-0 pointer-events-none",
        )}
      >
        <NewStepMenu
          index={index}
          onClose={() => setIsCreatingStep(false)}
        />
      </div>
    </div>
  </div>
</div>
      <div
        className={cn(
          "h-0 w-0.5 bg-border transition-all ease-in-out mt-2",
          isDisabled && "mt-0 h-2",
        )}
      />
    </div>
  );
}

function SignalStepButton({ step }: { step: Step }) {
  return (
    <div>
      <span>Signal</span>
    </div>
  );
}

function NewStepMenu(
  { index, onClose }: { index: number; onClose: () => void },
) {
  const { addStepAtIndex } = useWorkflowActions();

  const handleAddStep = (type: StepType) => {
    addStepAtIndex(index, { type });
    onClose();
  };
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleAddStep("code")}
        className="w-5 h-5 p-0.5 bg-background rounded-lg flex items-center justify-center hover:bg-primary/40 transition-all ease-in-out cursor-pointer"
      >
        <CodeXml className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleAddStep("tool")}
        className="w-5 h-5 p-0.5 bg-background rounded-lg flex items-center justify-center hover:bg-primary/40 transition-all ease-in-out cursor-pointer"
      >
        <Wrench className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onClose()}
        className="w-5 h-5 p-px rounded-full bg-transparent transition-all ease-in-out cursor-pointer flex items-center justify-center"
      >
        <X
          onClick={() => onClose()}
          className={cn(
            "w-4 h-4 text-primary-foreground transition-all ease-in-out",
          )}
        />
      </button>
      <button
        onClick={() => handleAddStep("sleep")}
        className="w-5 h-5 p-0.5 bg-background rounded-lg flex items-center justify-center hover:bg-primary/40 transition-all ease-in-out cursor-pointer"
      >
        <ClockIcon className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleAddStep("wait_for_signal")}
        className="w-5 h-5 p-0.5 bg-background rounded-lg flex items-center justify-center hover:bg-primary/40 transition-all ease-in-out cursor-pointer"
      >
        <BellIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

function FlowLine({
  showContinueLine,
  color = "border",
  index,
}: {
  showContinueLine: boolean;
  color?: string;
  index: number;
}) {
  const trackingExecutionId = useTrackingExecutionId();
  const { isFinished } = useStepResults();

  return (
    <div className="flex flex-col  items-center justify-center mb-0.5 opacity-0">
      <div className={cn("w-[2px] h-10", `bg-${color}`)} />
      <div className="flex items-center justify-center flex-1 h-4 relative">
        <div
          className={cn((!isFinished && trackingExecutionId) && "invisible")}
        >
          <NewStepButton index={index} />
        </div>
        <div
          className={cn(
            "w-[2px] absolute top-0 invisible  bottom-0 left-1/2 -translate-x-1/2",
            `bg-${color}`,
            (!isFinished && trackingExecutionId) && "visible",
          )}
        />
      </div>
      {showContinueLine && (
        <div className="relative">
          <div className={cn("w-[2px] h-10", `bg-${color}`)} />
          <ChevronDown
            className={cn(
              "w-5 h-5 text-border",
              `text-${color}`,
              `absolute -bottom-2.5 left-1/2 -translate-x-1/2`,
            )}
          />
        </div>
      )}
    </div>
  );
}

function StepMenu({ step }: { step: Step }) {
  const { deleteStep } = useWorkflowActions();
  const isManual = "toolName" in step.action &&
    step.action.toolName === "WORKFLOW_START" &&
    step.name === "Manual";

  const actions = useMemo(() => {
    return [
      ...(!isManual
        ? [
          {
            label: "Delete",
            icon: "delete",
            onClick: () => deleteStep(step.name),
          },
        ]
        : []),
    ];
  }, [isManual, deleteStep, step.name]);

  if (actions.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="h-7 w-7 p-0 text-muted-foreground flex items-center justify-end rounded-lg cursor-pointer">
          <Icon name="more_horiz" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {actions.map((action) => (
            <DropdownMenuItem key={action.label} onClick={action.onClick}>
              <Icon
                name={action.icon}
                className="w-4 h-4 text-muted-foreground"
              />
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function formatTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }

  const totalSeconds = milliseconds / 1000;
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds.toFixed(3)}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toFixed(3)}s`;
  }
  return `${seconds.toFixed(3)}s`;
}

const Duration = ({ startTime, endTime, shouldSubscribe }: { startTime: string | null | undefined, endTime: string | null | undefined, shouldSubscribe: boolean }) => { 
  const timeRef = useRef(Date.now());
;
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!shouldSubscribe) return () => {};

      const interval = setInterval(() => {
        timeRef.current = Date.now();
        callback();
      }, 50);

      return () => clearInterval(interval);
    },
    [shouldSubscribe],
  );
  const getSnapshot = useCallback(() => {
    return shouldSubscribe ? timeRef.current : 0;
  }, [shouldSubscribe]);
  const currentTime = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!startTime && !endTime) return null;

  // Calculate duration in real-time (directly in render, NOT in useMemo!)
  let duration: number | null = null;
  if (startTime) {
    const start = new Date(startTime).getTime();
    if (endTime) {
      // If endTime exists, use it
      const end = new Date(endTime).getTime();
      duration = Math.max(0, end - start);
    } else if (shouldSubscribe) {
      // If no endTime but step is running, use currentTime for live duration
      duration = Math.max(0, currentTime - start);
    }
    // Otherwise duration remains null (shows "-")
  }

  return formatDuration(duration ?? 0);
}

export const StepCard = ({
  step,
  icon,
  style,
  iconBgColor = "primary",
  action,
}: {
  step: Step;
  icon: React.ReactNode;
  iconBgColor?: string;
  style?: "success" | "error" | "pending" | "waiting_for_signal" | undefined;
  action?: () => void;
}) => {
  const { setCurrentStepName } = useWorkflowActions();
  const { isFetching, stepResult } = useStepResult(step.name);
  const registerRef = useRegisterStep(step.name);

  const shouldSubscribe = useMemo(() => {
    return stepResult && stepResult.created_at && !stepResult.completed_at_epoch_ms && !stepResult.error;
  }, [stepResult]);

  const derivedStyle = useMemo(() => {
    if (style) return style;
    if (stepResult?.error) return "error";
    if (isFetching && !stepResult?.output) return "pending";
    if (stepResult?.output) return "success";
    return undefined;
  }, [isFetching, style, stepResult]);

  const handleClick = () => {
    setCurrentStepName(step.name);
    action?.();
  };

  return (
    <Card
      ref={registerRef}  // <-- ADD THIS LINE
      onClick={handleClick}
      className={cn(
        "w-full p-0 px-4 h-14 group flex items-center justify-center relative",
        derivedStyle === "pending" && "animate-pulse border-warning",
        derivedStyle === "error" && "border-destructive",
        derivedStyle === "success" && "border-success",
        derivedStyle === "waiting_for_signal" && "border-primary",
      )}
    >
      <CardHeader className="flex items-center justify-between gap-2 p-0 w-full">
        <div className="flex flex-1 items-center gap-2">
          <div
            className={cn(
              "h-6 w-6 p-1 flex items-center justify-center rounded-lg",
              `bg-${iconBgColor}`,
            )}
          >
            {icon}
          </div>

          <CardTitle className="p-0 text-base font-medium truncate mt-px">
            {step.name}
          </CardTitle>
          <div>
             <Duration startTime={stepResult?.created_at} endTime={stepResult?.completed_at_epoch_ms ? new Date(stepResult.completed_at_epoch_ms).toISOString() : undefined} shouldSubscribe={!!shouldSubscribe} />
          </div>
        </div>
        <CardAction className="group-hover:opacity-100 opacity-0 transition-opacity">
          <StepMenu step={step} />
        </CardAction>
      </CardHeader>
    </Card>
  );
};
