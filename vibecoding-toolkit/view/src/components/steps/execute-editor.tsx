import { memo, useEffect } from "react";
import { Button } from "@decocms/ui/components/button.tsx";
import { Icon } from "@decocms/ui/components/icon.tsx";

interface StepExecuteEditorProps {
  code: string;
}

export const StepExecuteEditor = memo(function StepExecuteEditor({
  code,
}: StepExecuteEditorProps) {
  return (
    <div
      className="border-b border-base-border bg-background p-4 space-y-3"
      id="editor"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm text-muted-foreground uppercase leading-5">
          Execute Code
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
          >
            Reset
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 px-3 text-xs gap-1"
          >
            <Icon name="check" size={14} />
            Save
          </Button>
        </div>
      </div>
      <div className="relative space-y-2">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Export a default async function:{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              (input, ctx) =&gt; Promise&lt;output&gt;
            </code>
          </p>
          <p>
            Access tools via{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              ctx.env[integrationId][toolName]()
            </code>
          </p>
        </div>
      </div>
    </div>
  );
});
