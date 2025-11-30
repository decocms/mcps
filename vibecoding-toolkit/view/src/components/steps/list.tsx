import { Spinner } from "@decocms/ui/components/spinner.tsx";
import { StepCard } from "@/components/workflow";
import { memo, useDeferredValue, useRef, Suspense } from "react";
import type { Step } from "@/lib/workflow-types";

interface WorkflowStepsListProps {
  steps?: Step[];
}

export const WorkflowStepsList = memo(function WorkflowStepsList({
  steps = [],
}: WorkflowStepsListProps) {
  const deferredSteps = useDeferredValue(steps);
  const parentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={parentRef}
      className="h-full w-full overflow-auto"
      style={{
        contain: "strict",
      }}
    >
      <div className="flex justify-center">
        <div className="w-full max-w-[700px]">
          <div
            style={{
              height: `380px`,
              width: "100%",
              position: "relative",
            }}
          >
            {deferredSteps.map((step, index) => {
              return (
                <div key={step.name} className="pb-8">
                  <Suspense fallback={<Spinner />}>
                    <StepCard
                      step={step}
                      phaseIndex={0}
                      stepIndex={index}
                      isSelected={false}
                      onSelect={() => {}}
                      onEdit={() => {}}
                      onDelete={() => {}}
                    />
                  </Suspense>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
