import {
  Box,
  Check,
  GitBranch,
  GitMerge,
  GitPullRequest,
  ListChecks,
  Play,
  Gauge,
  Rocket,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

/**
 * Visual pipeline stepper — reads a site status and renders the phase chain
 * with concluded / current / pending states, so non-technical people can see
 * "where the migration is" at a glance. Used in the drawer and the home widget.
 */

export const PIPELINE_PHASES = [
  { key: "repo", label: "Repo", icon: GitBranch },
  { key: "sandbox", label: "Sandbox", icon: Box },
  { key: "script", label: "Script", icon: Play },
  { key: "pr", label: "PR", icon: GitPullRequest },
  { key: "triage", label: "Triagem", icon: ListChecks },
  { key: "fix", label: "Fixes", icon: Wrench },
  { key: "parity", label: "Paridade", icon: Gauge },
  { key: "deploy", label: "Deploy", icon: Rocket },
  { key: "merge", label: "Merge", icon: GitMerge },
] as const;

type PhaseKey = (typeof PIPELINE_PHASES)[number]["key"];

/** Map a site status (current + legacy names) to its phase index. */
const STATUS_TO_PHASE: Record<string, PhaseKey> = {
  creating_repo: "repo",
  provisioning_sandbox: "sandbox",
  migrating_script: "script",
  // legacy migrating* → script
  migrating: "script",
  migrating2: "script",
  migrating3: "script",
  opening_pr: "pr",
  installing_sync: "pr", // legacy
  triaging: "triage",
  fixing: "fix",
  paritying: "parity",
  // legacy validating* → parity
  validating: "parity",
  validating2: "parity",
  validating3: "parity",
  deploying: "deploy",
  deploying_cf: "deploy", // legacy
  awaiting_merge: "merge",
};

function phaseIndexFor(status: string): number {
  if (status === "done") return PIPELINE_PHASES.length; // all concluded
  if (status === "queued") return -1; // nothing started
  const key = STATUS_TO_PHASE[status];
  if (!key) return -1;
  return PIPELINE_PHASES.findIndex((p) => p.key === key);
}

export interface PipelineStepperProps {
  status: string;
  /** phase the site was in when it blocked (resume_status), used for needs_human/failed */
  resumeStatus?: string | null;
  phaseDetail?: string | null;
  /** compact = smaller icons/labels for the home widget */
  compact?: boolean;
  className?: string;
}

export function PipelineStepper({
  status,
  resumeStatus,
  phaseDetail,
  compact,
  className,
}: PipelineStepperProps) {
  const isDone = status === "done";
  const isBlocked = status === "needs_human" || status === "failed";
  // blocked statuses aren't phases — highlight the phase they blocked AT
  // (resume_status), so the stepper never renders all-grey when it matters most
  const currentIdx = isBlocked
    ? phaseIndexFor(resumeStatus ?? "")
    : phaseIndexFor(status);
  const iconSize = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  const dot = compact ? "h-6 w-6" : "h-7 w-7";

  return (
    <div
      className={cn("flex w-full items-start overflow-x-auto pb-1", className)}
    >
      {PIPELINE_PHASES.map((phase, i) => {
        const concluded = isDone || i < currentIdx;
        const current = !isDone && i === currentIdx;
        const Icon = phase.icon;

        const ring = concluded
          ? "border-primary bg-primary/15 text-emerald-600 dark:text-emerald-400"
          : current
            ? isBlocked
              ? status === "failed"
                ? "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400"
                : "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "border-indigo-500 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
            : "border-border bg-muted text-muted-foreground/50";

        return (
          <div
            key={phase.key}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={current && phaseDetail ? phaseDetail : phase.label}
          >
            <div className="flex w-full items-center">
              {/* connector left */}
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === 0
                    ? "bg-transparent"
                    : concluded || current
                      ? "bg-primary/60"
                      : "bg-border",
                )}
              />
              <span
                className={cn(
                  "relative flex shrink-0 items-center justify-center rounded-full border-2",
                  dot,
                  ring,
                )}
              >
                {concluded ? (
                  <Check className={iconSize} />
                ) : (
                  <Icon className={iconSize} />
                )}
                {current && !isBlocked && (
                  <span className="absolute inset-0 animate-ping rounded-full border-2 border-indigo-500 opacity-40" />
                )}
              </span>
              {/* connector right */}
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === PIPELINE_PHASES.length - 1
                    ? "bg-transparent"
                    : concluded
                      ? "bg-primary/60"
                      : "bg-border",
                )}
              />
            </div>
            <span
              className={cn(
                "truncate text-center leading-tight",
                compact ? "text-[9px]" : "text-[10px]",
                current
                  ? "font-semibold text-foreground"
                  : concluded
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50",
              )}
            >
              {phase.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
