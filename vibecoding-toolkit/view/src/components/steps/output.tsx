import { useMemo } from "react";

function deepParse(value: unknown, depth = 0): unknown {
  if (typeof value !== "string") {
    return value;
  }

  // Try to parse the string as JSON
  try {
    if (depth > 8) return value;
    const parsed = JSON.parse(value);
    return deepParse(parsed, depth + 1);
  } catch {
    // If parsing fails, check if it looks like truncated JSON
    const trimmed = value.trim();
    const withoutTruncation = trimmed.replace(/\s*\[truncated output]$/i, "");
    if (withoutTruncation.startsWith("{") && !withoutTruncation.endsWith("}")) {
      // Truncated JSON object - try to fix it
      try {
        let fixed = withoutTruncation;
        const quoteCount = (fixed.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) {
          fixed += '"';
        }
        // Add closing brace
        fixed += "}";
        const parsed = JSON.parse(fixed);
        return parsed;
      } catch {
        // If fix didn't work, return as string
        return value;
      }
    }
    if (withoutTruncation.startsWith("[") && !withoutTruncation.endsWith("]")) {
      try {
        const fixed = withoutTruncation;
        const parsed = JSON.parse(fixed + "]");
        return parsed;
      } catch {
        return value;
      }
    }
    // Not truncated JSON or couldn't fix, return as string
    return value;
  }
}

interface StepOutputProps {
  output: unknown;
  views?: readonly string[];
}

export function StepOutput({ output, views = [] }: StepOutputProps) {
  if (output === undefined || output === null) return null;

  const parsedOutput = useMemo(() => deepParse(output), [output]);
  const hasViews = views.length > 0;

  return (
    <div
      className="px-4 pt-4 pb-2 flex flex-col gap-5 relative min-w-0 overflow-hidden"
      style={{
        backgroundImage: hasViews
          ? "linear-gradient(90deg, rgba(245, 245, 245, 0.5) 0%, rgba(245, 245, 245, 0.5) 100%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)"
          : undefined,
        backgroundColor: hasViews ? undefined : "#ffffff",
      }}
    >
      <p className="font-mono text-sm text-muted-foreground uppercase leading-5">
        Execution Result
      </p>

      <div className="flex items-center gap-2">
        {hasViews && (
          <div
            className="flex overflow-x-auto items-center gap-3 rounded-md"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          ></div>
        )}
      </div>

      <div className="min-w-0 overflow-hidden">
        <pre className="text-xs text-muted-foreground">
          {JSON.stringify(parsedOutput, null, 2)}
        </pre>
      </div>
    </div>
  );
}
