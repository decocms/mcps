import { Icon } from "@decocms/ui/components/icon.tsx";
import { Button } from "@decocms/ui/components/button.tsx";
import { cn } from "@decocms/ui/lib/utils.ts";
import { memo } from "react";
import { StepTitle } from "./title";
import { Spinner } from "@decocms/ui/components/spinner.tsx";
import { StepOptions } from "./options.tsx";

interface StepHeaderProps {
  stepName: string;
  description?: string;
  status?: string;
  type?: "definition" | "runtime";
}

export const StepHeader = memo(function StepHeader({
  stepName,
  description,
  status,
  type = "definition",
}: StepHeaderProps) {
  const isFailed = status === "failed";
  const isRunning = status === "running";
  const isExecuteEditorOpen = true;
  const didRun = false;

  return (
    <div
      className={cn(
        "px-4 py-2 flex items-center justify-between overflow-hidden rounded-t-xl",
        isFailed && "text-destructive",
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Icon name="flag" size={16} className="text-foreground shrink-0" />
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 w-full">
            <StepTitle stepName={stepName} description={description} />
            {type === "definition" && (
              <div className="flex items-center gap-2 shrink-0">
                <StepOptions stepName={stepName} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-8 rounded-xl p-0",
                    isExecuteEditorOpen && "bg-accent text-accent-foreground",
                  )}
                  title="View/Edit Execute Code"
                >
                  <Icon
                    name="code"
                    size={20}
                    className={
                      isExecuteEditorOpen
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-sm font-medium h-8 px-3 py-2 gap-2 shrink-0"
                >
                  {isRunning ? (
                    <>
                      <Spinner size="xs" />
                      <span className="text-sm leading-5">Running</span>
                    </>
                  ) : (
                    <>
                      <Icon name="play_arrow" size={11} />
                      <span className="text-sm leading-5">
                        {didRun ? "Re-run" : "Run step"}
                      </span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
