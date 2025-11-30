import { memo } from "react";
import { StepError } from "./error.tsx";
import { StepOutput } from "./output.tsx";
import { StepHeader } from "./header.tsx";
import { StepAttempts } from "./attempts.tsx";
import { StepFooter } from "./footer.tsx";

/**
 * Derives the step status from execution properties (works for both runtime and definition steps)
 */
function deriveStepStatus(execution: {
  success?: boolean | null;
  error?: { message?: string; name?: string } | null;
  start?: string | null;
  end?: string | null;
}): string | undefined {
  if (
    execution.success == null &&
    !execution.error &&
    !execution.start &&
    !execution.end
  )
    return;
  // If step has error, it failed
  if (execution.error) return "failed";

  // If step has ended successfully
  if (execution.end && execution.success === true) return "completed";

  // If step has ended but not successfully
  if (execution.end && execution.success === false) return "failed";

  // If step has started but not ended, it's running
  if (execution.start && !execution.end) return "running";

  // Otherwise, it's pending
  return "pending";
}

export const WorkflowRunStepCard = memo(
  function WorkflowRunStepCard({ step = {} }: { step: any }) {
    return (
      <div className="rounded-xl p-1 bg-card shadow-xs min-w-0">
        <StepHeader
          type="runtime"
          stepName={step.name}
          status={deriveStepStatus(step)}
        />
        <div className="bg-background rounded-xl shadow-xs overflow-hidden min-w-0">
          <StepContent step={step} />
        </div>
        <StepFooter
          startTime={step.start}
          endTime={step.end}
          status={deriveStepStatus(step)}
          cost={step.cost}
        />
      </div>
    );
  },
  (prevProps, nextProps) => prevProps.step.name === nextProps.step.name,
);

const StepContent = memo(function StepContent({ step = {} }: { step: any }) {
  return (
    <>
      <StepError error={step.error} />
      <StepOutput output={step.output} views={step.views} />
      <StepAttempts attempts={step.attempts || []} />
    </>
  );
});
