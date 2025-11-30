/**
 * StepEditor Component
 *
 * Full step editor with JSON editing, action-specific forms, and validation.
 * Uses WorkflowEditorStore - single source of truth.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import { memo } from "react";
import { Icon } from "@decocms/ui/components/icon.tsx";
import { Button } from "@decocms/ui/components/button.tsx";
import { Input } from "@decocms/ui/components/input.tsx";
import { Label } from "@decocms/ui/components/label.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@decocms/ui/components/tabs.tsx";
import { Alert, AlertDescription } from "@decocms/ui/components/alert.tsx";
import { cn } from "@/lib/utils";
import { MonacoCodeEditor } from "@/components/monaco-editor";
import { isCodeAction } from "@/lib/workflow-types";
import {
  useSelectedStep,
  useStepEditorTab,
  useStepEditorJsonValue,
  useStepEditorJsonErrors,
  useStepEditorCodeValue,
  useSelectedStepRetry,
  useWorkflowEditorActions,
} from "@/stores/workflow-editor-store";
import { SuspenseStore } from "../store";

// ============================================================================
// Types
// ============================================================================

interface StepEditorProps {
  onClose: () => void;
  className?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export const StepEditor = memo(function StepEditor({
  onClose,
  className,
}: StepEditorProps) {
  const step = useSelectedStep();
  const activeTab = useStepEditorTab();
  const jsonErrors = useStepEditorJsonErrors();
  const actions = useWorkflowEditorActions();

  if (!step) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No step selected
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <StepEditorHeader stepName={step.name} onClose={onClose} />

      {/* Errors */}
      {jsonErrors.length > 0 && (
        <div className="p-3 border-b">
          <Alert variant="destructive">
            <Icon name="error" size={16} />
            <AlertDescription>
              <ul className="list-disc list-inside">
                {jsonErrors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => actions.setStepEditorTab(v as typeof activeTab)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="mx-3 mt-3">
          <TabsTrigger value="action">Action</TabsTrigger>
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="retry">Retry</TabsTrigger>
          <TabsTrigger value="store">Store</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          <TabsContent value="action" className="h-full m-0 p-3">
            <StepActionEditor />
          </TabsContent>

          <TabsContent value="input" className="h-full m-0 p-3">
            <StepInputEditor />
          </TabsContent>

          <TabsContent value="retry" className="h-full m-0 p-3">
            <StepRetryEditor />
          </TabsContent>

          <TabsContent value="store" className="h-full m-0 p-3">
            <SuspenseStore query="image" />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
});

// ============================================================================
// Header Component
// ============================================================================

interface StepEditorHeaderProps {
  stepName: string;
  onClose: () => void;
}

const StepEditorHeader = memo(function StepEditorHeader({
  stepName,
  onClose,
}: StepEditorHeaderProps) {
  const actions = useWorkflowEditorActions();

  return (
    <div className="flex items-center justify-between p-3 border-b bg-muted/30">
      <div className="flex items-center gap-3">
        <Icon name="edit" size={20} className="text-primary" />
        <Input
          value={stepName}
          onChange={(e) => actions.updateSelectedStepName(e.target.value)}
          className="h-8 font-medium"
          placeholder="Step name"
        />
      </div>
      <Button variant="ghost" size="icon" onClick={onClose}>
        <Icon name="close" size={20} />
      </Button>
    </div>
  );
});

// ============================================================================
// Action Editor Component
// ============================================================================

const StepActionEditor = memo(function StepActionEditor() {
  const step = useSelectedStep();
  const jsonValue = useStepEditorJsonValue();
  const codeValue = useStepEditorCodeValue();
  const actions = useWorkflowEditorActions();

  if (!step) return null;

  const isCode = isCodeAction(step.action);

  if (isCode) {
    return (
      <div className="h-full flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Transform Code</Label>
          <span className="text-xs text-muted-foreground">
            TypeScript function to transform input data
          </span>
        </div>
        <div className="flex-1 h-[800px] border">
          <MonacoCodeEditor
            code={codeValue}
            onChange={(v) => actions.setStepEditorCodeValue(v ?? "")}
            onSave={() => actions.applyStepCode()}
            language="typescript"
            height={500}
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => actions.applyStepCode()}>
            <Icon name="check" size={16} />
            Apply Code
          </Button>
        </div>
        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium">Code Format</p>
          <p className="text-xs text-muted-foreground">
            Define input/output interfaces and export a default function that
            transforms the input.
          </p>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {`interface Input { /* your input shape */ }
interface Output { /* your output shape */ }
export default (input: Input): Output => {
  // transform logic
  return { ... };
}`}
          </pre>
        </div>
      </div>
    );
  }

  // JSON editor for non-code actions (tool calls, signals, sleep)
  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Step Configuration</Label>
        <span className="text-xs text-muted-foreground">
          Edit the full step definition as JSON
        </span>
      </div>
      <div className="flex-1 min-h-[300px]">
        <MonacoCodeEditor
          code={jsonValue}
          onChange={(v) => actions.setStepEditorJsonValue(v ?? "")}
          onSave={() => actions.parseAndApplyStepJson()}
          language="json"
          height={500}
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => actions.parseAndApplyStepJson()}>
          <Icon name="check" size={16} />
          Apply JSON
        </Button>
      </div>
    </div>
  );
});

// ============================================================================
// Input Editor Component
// ============================================================================

const StepInputEditor = memo(function StepInputEditor() {
  const step = useSelectedStep();
  const actions = useWorkflowEditorActions();

  if (!step) return null;

  const inputJson = JSON.stringify(step.input ?? {}, null, 2);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Input Mapping</Label>
        <p className="text-xs text-muted-foreground">
          Map data from previous steps using @ref syntax (e.g.,
          @stepName.output.field)
        </p>
      </div>

      <div className="min-h-[200px]">
        <MonacoCodeEditor
          code={inputJson}
          onChange={(v) => {
            try {
              const parsed = JSON.parse(v ?? "{}");
              actions.updateSelectedStepInput(parsed);
            } catch {
              // Ignore parse errors while typing
            }
          }}
          language="json"
          height={200}
        />
      </div>

      <div className="bg-muted/30 rounded-lg p-3 space-y-2">
        <p className="text-xs font-medium">Reference Syntax</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>
            <code className="bg-muted px-1 rounded">@input.fieldName</code> -
            Workflow input
          </li>
          <li>
            <code className="bg-muted px-1 rounded">@stepName.output</code> -
            Previous step output
          </li>
          <li>
            <code className="bg-muted px-1 rounded">
              @stepName.output.nested.field
            </code>{" "}
            - Nested field
          </li>
        </ul>
      </div>
    </div>
  );
});

// ============================================================================
// Retry Editor Component
// ============================================================================

const StepRetryEditor = memo(function StepRetryEditor() {
  const retry = useSelectedStepRetry();
  const actions = useWorkflowEditorActions();

  const handleMaxAttemptsChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      actions.updateSelectedStepRetry({
        maxAttempts: num,
        backoffMs: retry?.backoffMs ?? 1000,
      });
    }
  };

  const handleBackoffChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      actions.updateSelectedStepRetry({
        maxAttempts: retry?.maxAttempts ?? 3,
        backoffMs: num,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Retry Configuration</Label>
        {retry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => actions.updateSelectedStepRetry(undefined)}
            className="text-destructive"
          >
            <Icon name="delete" size={14} />
            Remove
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maxAttempts" className="text-sm">
            Max Attempts
          </Label>
          <Input
            id="maxAttempts"
            type="number"
            min={0}
            value={retry?.maxAttempts ?? ""}
            onChange={(e) => handleMaxAttemptsChange(e.target.value)}
            placeholder="3"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="backoffMs" className="text-sm">
            Backoff (ms)
          </Label>
          <Input
            id="backoffMs"
            type="number"
            min={0}
            step={100}
            value={retry?.backoffMs ?? ""}
            onChange={(e) => handleBackoffChange(e.target.value)}
            placeholder="1000"
          />
        </div>
      </div>

      {!retry && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            actions.updateSelectedStepRetry({ maxAttempts: 3, backoffMs: 1000 })
          }
        >
          <Icon name="add" size={14} />
          Add Retry Config
        </Button>
      )}

      <div className="bg-muted/30 rounded-lg p-3 space-y-2">
        <p className="text-xs font-medium">Retry Behavior</p>
        <p className="text-xs text-muted-foreground">
          If the step fails, it will retry up to{" "}
          <strong>{retry?.maxAttempts ?? 0}</strong> times with{" "}
          <strong>{retry?.backoffMs ?? 0}ms</strong> initial backoff
          (exponential).
        </p>
      </div>
    </div>
  );
});
