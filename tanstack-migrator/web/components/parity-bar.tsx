import { cn } from "@/lib/utils.ts";

export function ParityBar({
  score,
  target,
  baselineScore,
  compact,
}: {
  score: number | null;
  target: number;
  baselineScore?: number | null;
  compact?: boolean;
}) {
  const value = score ?? 0;
  const reached = score !== null && score >= target;

  return (
    <div className="flex w-full items-center gap-2">
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            reached ? "bg-primary" : "bg-indigo-500",
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
        {/* baseline marker */}
        {baselineScore != null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-zinc-400/60 dark:bg-zinc-500/60"
            style={{ left: `${Math.min(100, Math.max(0, baselineScore))}%` }}
            title={`baseline Fresh: ${Math.round(baselineScore)}%`}
          />
        )}
        {/* target marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground/40"
          style={{ left: `${target}%` }}
          title={`alvo ${target}%`}
        />
      </div>
      {!compact && (
        <span
          className={cn(
            "min-w-[3.5rem] text-right text-sm font-semibold tabular-nums",
            reached ? "text-emerald-600 dark:text-emerald-400" : "",
          )}
        >
          {score !== null ? `${Math.round(score)}%` : "—"}
        </span>
      )}
    </div>
  );
}
