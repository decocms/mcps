# Workflow Schema Design

> **Status**: Final Draft  
> **Date**: November 2025  
> **Based on**: Patterns from DBOS Transact and Durable packages

---

## 1. Design Philosophy

### Core Principles

1. **Keep it simple** - One unified step schema, not many discriminated types
2. **Control flow in phases** - Steps grouped into sequential phases, parallel within
3. **Pure transforms** - Code steps are deterministic (no side effects, no ctx)
4. **Linear executions** - No nested workflows; use triggers for chaining
5. **Explicit over implicit** - No magic dependency detection

### Step Categories

| Type | Purpose | Deterministic? | Side Effects? |
|------|---------|----------------|---------------|
| **Tool step** | Call external service via MCP | ❌ No | ✅ Yes (checkpointed) |
| **Transform step** | Pure TypeScript data transformation | ✅ Yes | ❌ No |
| **Sleep step** | Wait for time | ✅ Yes | ❌ No |

---

## 2. Schema Definition

### Step Schema

```typescript
const StepSchema = z.object({
  name: z.string().describe("Unique step name within workflow"),
  
  // === WHAT TO DO (pick one) ===
  
  /** Call an external tool (non-deterministic, checkpointed) */
  tool: z.object({ 
    connectionId: z.string(), 
    toolName: z.string() 
  }).optional(),
  
  /** 
   * Pure TypeScript transformation (deterministic, replayable)
   * 
   * Must declare Input and Output interfaces for validation.
   * Transpiled to JS before execution in QuickJS sandbox.
   * 
   * Receives: input object (with resolved @refs)
   * Returns: JSON-serializable value matching Output interface
   * 
   * FORBIDDEN: fetch, Date, Math.random, crypto, setTimeout, ctx, imports
   * ALLOWED: string ops, array methods, object mapping, math (non-random)
   * 
   * Example:
   * "interface Input { items: string[] }
   *  interface Output { names: string[] }
   *  export default (input: Input): Output => ({ names: input.items.map(i => i.toUpperCase()) })"
   */
  transform: z.string().optional(),
  
  /** Sleep/wait until time passes */
  sleep: z.object({
    ms: z.number().optional(),
    until: z.string().optional(), // ISO date string or @ref
  }).optional(),
  
  // === INPUT ===
  
  /** 
   * Input object with @ref resolution
   * @refs: @stepName.output.path, @input.path
   */
  input: z.record(z.unknown()).optional(),
  
  // === MODIFIERS ===
  
  /** Loop: repeat step for each item in referenced array */
  forEach: z.string().optional(),
  
  /** Variable name for current item in forEach loop */
  as: z.string().default("item"),
  
  /** Safety limit for forEach iterations */
  maxIterations: z.number().default(100),
  
  // === RETRY (tool steps only) ===
  
  retry: z.object({
    maxAttempts: z.number().default(3),
    backoffMs: z.number().default(1000),
  }).optional(),
});
```

### Trigger Schema

```typescript
const TriggerSchema = z.object({
  /** Target workflow ID to execute */
  workflowId: z.string(),
  
  /** 
   * Inputs for the new execution (uses @refs like step inputs)
   * Maps output data to workflow input fields.
   * 
   * If any @ref doesn't resolve (property missing), this trigger is SKIPPED.
   */
  inputs: z.record(z.unknown()),
  
  /** 
   * For array values: trigger one execution per item.
   * The @ref path to iterate over.
   * When set, @item and @index are available in inputs.
   */
  forEach: z.string().optional(),
  
  // === Execution config for triggered workflow ===
  
  workflow_timeout_ms: z.number().optional(),
  max_retries: z.number().optional(),
});
```

### Workflow Schema

```typescript
const WorkflowSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  
  /** 
   * Steps organized into phases.
   * - Phases execute sequentially
   * - Steps within a phase execute in parallel
   */
  steps: z.array(z.array(StepSchema)),
  
  /** Triggers to fire when execution completes successfully */
  triggers: z.array(TriggerSchema).optional(),
});
```

---

## 3. Execution Model

### Phase-Based Parallelism

Steps are organized into **phases**. Phases run sequentially. Steps within a phase run in parallel.

```
Phase 0:  [A]           → run A, wait for completion
Phase 1:  [B, C, D, E]  → run B,C,D,E in parallel, wait for all
Phase 2:  [F]           → run F (can access outputs from A,B,C,D,E)
```

### @ref Resolution

| Pattern | Description |
|---------|-------------|
| `@stepName.output` | Output of a step from a previous phase |
| `@stepName.output.path.to.value` | Nested property access |
| `@input.path` | Workflow input parameter |
| `@item` | Current item in forEach loop |
| `@index` | Current index in forEach loop |

### Transform Step Execution

Transform steps support **TypeScript** with `Input` and `Output` interface declarations. Before execution, the code is transpiled to JavaScript and run in a sandboxed QuickJS environment.

#### TypeScript Transform Example

```typescript
// Transform step code (TypeScript)
interface Input {
  users: Array<{ 
    id: string; 
    name: string; 
    email: string; 
    active: boolean;
  }>;
}

interface Output {
  emails: string[];
  count: number;
}

export default (input: Input): Output => {
  const activeUsers = input.users.filter(u => u.active);
  return {
    emails: activeUsers.map(u => u.email),
    count: activeUsers.length
  };
};
```

#### Execution Pipeline

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  TypeScript     │────▶│  Extract Types   │────▶│  JSON Schema    │
│  transform code │     │  (Input/Output)  │     │  for validation │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                                                │
         │                                                ▼
         │              ┌──────────────────┐     ┌─────────────────┐
         └─────────────▶│  Transpile to JS │────▶│  Run in QuickJS │
                        │  (ts.transpile)  │     │  (pure sandbox) │
                        └──────────────────┘     └─────────────────┘
```

#### Sandbox Restrictions

```typescript
async function executeTransform(tsCode: string, input: unknown): Promise<unknown> {
  // 1. Transpile TypeScript to JavaScript
  const jsCode = ts.transpileModule(tsCode, {
    compilerOptions: { target: ts.ScriptTarget.ES2015, module: ts.ModuleKind.ESNext }
  }).outputText;
  
  // 2. Run in pure sandbox - NO non-deterministic globals
  // FORBIDDEN: fetch, Date, crypto, setTimeout, setInterval, ctx, imports
  // ALLOWED: JSON, Object, Array, String, Number, Boolean, Math (without random)
  
  // 3. Execute with ONLY input parameter - no ctx, no state access
  return await runInSandbox(jsCode, input);
}
```

#### TypeScript Rules

- ✅ Local `interface` and `type` declarations
- ✅ Basic TypeScript syntax (generics, unions, etc.)
- ✅ Must have `Input` interface (for validation)
- ✅ Must have `Output` interface (for validation)
- ❌ No `import` statements
- ❌ No external dependencies
- ❌ No `async/await` (pure synchronous transforms)

**Why no ctx?** Transform steps must be deterministic. They can be re-executed on crash recovery and must produce the same result. For non-deterministic operations (API calls, random values, current time), use tool steps.

### Trigger Resolution

Triggers fire based on @ref resolution - **no explicit `if` needed**:

```typescript
function shouldFireTrigger(trigger: Trigger, output: unknown): boolean {
  // Try to resolve all @refs in inputs
  for (const [key, value] of Object.entries(trigger.inputs)) {
    if (isAtRef(value)) {
      const resolved = resolveRef(value, output);
      if (resolved === undefined) {
        return false;  // Missing ref → skip this trigger
      }
    }
  }
  return true;
}
```

Conditional logic is handled in transform steps, which shape the output to control which triggers fire.

---

## 4. Examples

### Simple Sequential Workflow

```json
{
  "name": "simple-pipeline",
  "steps": [
    [{ "name": "fetch", "tool": { "connectionId": "api", "toolName": "get-data" } }],
    [{ "name": "process", "tool": { "connectionId": "processor", "toolName": "run" } }],
    [{ "name": "save", "tool": { "connectionId": "db", "toolName": "insert" } }]
  ]
}
```

### Parallel Processing

```json
{
  "name": "parallel-pipeline",
  "steps": [
    [
      { "name": "A", "tool": { "connectionId": "api", "toolName": "fetch" } }
    ],
    [
      { "name": "B", "tool": { "connectionId": "svc", "toolName": "processB" }, "input": { "data": "@A.output.data" } },
      { "name": "C", "tool": { "connectionId": "svc", "toolName": "processC" }, "input": { "data": "@A.output.data" } },
      { "name": "D", "tool": { "connectionId": "svc", "toolName": "processD" }, "input": { "data": "@A.output.data" } },
      { "name": "E", "tool": { "connectionId": "svc", "toolName": "processE" }, "input": { "data": "@A.output.data" } }
    ],
    [
      { 
        "name": "F", 
        "tool": { "connectionId": "svc", "toolName": "aggregate" },
        "input": { 
          "fromB": "@B.output.xpto",
          "fromC": "@C.output.xpto",
          "original": "@A.output.data"
        }
      }
    ]
  ]
}
```

### Transform Step (TypeScript, Pure Data Manipulation)

```json
{
  "steps": [
    [{ "name": "fetch", "tool": { "connectionId": "api", "toolName": "list-users" } }],
    [{ 
      "name": "extract-emails", 
      "transform": "interface Input { users: Array<{ email: string; active: boolean }> }\ninterface Output { emails: string[] }\nexport default (input: Input): Output => ({ emails: input.users.filter(u => u.active).map(u => u.email) })",
      "input": { "users": "@fetch.output.users" }
    }],
    [{ 
      "name": "send-batch", 
      "tool": { "connectionId": "email", "toolName": "send" },
      "input": { "recipients": "@extract-emails.output.emails" }
    }]
  ]
}
```

### ForEach Loop

```json
{
  "steps": [
    [{ "name": "get-items", "tool": { "connectionId": "api", "toolName": "list" } }],
    [{ 
      "name": "process-item",
      "forEach": "@get-items.output.items",
      "as": "item",
      "tool": { "connectionId": "processor", "toolName": "process" },
      "input": { "data": "@item" }
    }]
  ]
}
```

### Sleep/Wait

```json
{
  "steps": [
    [{ "name": "start-job", "tool": { "connectionId": "api", "toolName": "start" } }],
    [{ "name": "wait", "sleep": { "ms": 30000 } }],
    [{ "name": "check-status", "tool": { "connectionId": "api", "toolName": "status" } }]
  ]
}
```

### Execution Chaining with Triggers

```json
{
  "name": "batch-dispatcher",
  "steps": [
    [{ "name": "fetch-items", "tool": { "connectionId": "api", "toolName": "list" } }],
    [{ 
      "name": "prepare", 
      "transform": "export default (input) => input.items.map(x => ({ id: x.id, data: x }))"
    }]
  ],
  "triggers": [
    {
      "workflowId": "process-single-item",
      "forEach": "@output.items",
      "inputs": { 
        "item": "@item",
        "batchId": "@output.batchId"
      }
    }
  ]
}
```

### Conditional Triggers (via Transform Output Shaping)

```json
{
  "name": "order-processor",
  "steps": [
    [{ "name": "process-order", "tool": { "connectionId": "orders", "toolName": "process" } }],
    [{
      "name": "decide-next",
      "transform": "interface Input { success: boolean; order?: object; customer?: { email: string }; error?: string; orderId?: string }\ninterface Output { confirmation?: { order: object; email: string }; failure?: { error: string; orderId: string } }\nexport default (input: Input): Output => input.success ? { confirmation: { order: input.order!, email: input.customer!.email } } : { failure: { error: input.error!, orderId: input.orderId! } }",
      "input": { "success": "@process-order.output.success", "order": "@process-order.output.order", "customer": "@process-order.output.customer", "error": "@process-order.output.error", "orderId": "@process-order.output.orderId" }
    }]
  ],
  "triggers": [
    {
      "workflowId": "send-confirmation",
      "inputs": { 
        "orderDetails": "@output.confirmation.order",
        "email": "@output.confirmation.email"
      }
    },
    {
      "workflowId": "handle-failure",
      "inputs": { 
        "errorMessage": "@output.failure.error",
        "orderId": "@output.failure.orderId"
      },
      "max_retries": 5,
      "workflow_timeout_ms": 60000
    }
  ]
}
```

**How it works:**
- Transform step has typed `Input` and `Output` interfaces
- If `success === true` → output has `confirmation` → first trigger fires
- If `success === false` → output has `failure` → second trigger fires
- No `if` needed - the transform step shapes the output to control which triggers fire
- Validation catches type mismatches before execution

---

## 5. Design Decisions

### Why Phases Instead of DAG Dependencies?

| Approach | Pros | Cons |
|----------|------|------|
| Implicit deps (auto-detect @refs) | Less verbose | Magic, hard to reason about |
| Explicit `after: [...]` | Clear | Redundant, verbose |
| **Phases** ✅ | Simple, explicit, no redundancy | Slightly less flexible |

Phases are the right balance: simple to understand, easy for UI generation, no hidden behavior.

### Why Linear Executions + Triggers?

Instead of nested child workflows within an execution, we keep executions linear and use triggers:

- **Simpler execution model** - Each execution is a straight line of phases
- **Easier to debug** - No complex nesting to trace
- **Natural fan-out** - Triggers with `forEach` spawn parallel executions
- **Clear boundaries** - Each execution is independent, can retry independently

### Why Pure Transform Steps?

Transform steps (QuickJS) must be deterministic because:

- **Replay safety** - On crash recovery, transforms re-execute; must produce same result
- **Testing** - Pure functions are easy to test
- **Debugging** - Input → Output is transparent
- **No ctx** - Only receives `input`, returns output

For non-deterministic operations (API calls, random values, current time), use tool steps.

### Why No `if` on Triggers?

Conditional logic belongs in transform steps:

- **Single source of truth** - Logic is in one place (transform), not scattered
- **Testable** - Transform functions can be unit tested
- **Simpler triggers** - Triggers just check if @refs resolve

### Why TypeScript for Transform Steps?

Using TypeScript with `Input`/`Output` interfaces provides:

- **Schema extraction** - Convert interfaces to JSON Schema automatically
- **Pre-execution validation** - Verify @ref compatibility before running
- **Self-documenting** - Types ARE the schema, no separate declaration needed
- **Better DX** - IDE autocomplete, type checking in workflow editor
- **Still pure** - Transpiled JS runs in deterministic sandbox

---

## 6. Workflow Validation

### When Validation Runs

| Event | Validation | Why |
|-------|------------|-----|
| **Create workflow** | ✅ Full validation | Catch errors before saving |
| **Create execution (with inputs)** | ✅ Validate input @refs | Ensure execution inputs match workflow expectations |
| **During execution** | ❌ Never | Would add runtime delay |

Validation is a **one-time gate at creation**, not runtime overhead.

### Schema Extraction & Validation Pipeline

Validate @ref connections using schemas from:
1. **MCP Tools** - Input/output schemas from tool definitions
2. **Transform Steps** - Input/Output interfaces extracted from TypeScript

```
┌─────────────────────────────────────────────────────────────────┐
│              WORKFLOW CREATION VALIDATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Parse all transform steps → extract Input/Output schemas    │
│  2. Fetch MCP tool schemas for all tool steps                   │
│  3. Build schema map: { stepName: { input, output } }           │
│  4. For each @ref: validate source.output[path] → target.input  │
│  5. If errors → reject workflow creation                        │
│  6. If valid → save workflow with cached schemas                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              EXECUTION CREATION VALIDATION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Only if execution.inputs contains @refs:                        │
│  1. Load workflow's cached schemas                               │
│  2. Validate execution inputs match first phase's expectations  │
│  3. If errors → reject execution creation                        │
│  4. If valid → save execution, queue for processing             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### TypeScript to JSON Schema Conversion

```typescript
import ts from 'typescript';

function extractSchemas(tsCode: string): { input: JSONSchema; output: JSONSchema } {
  const sourceFile = ts.createSourceFile('transform.ts', tsCode, ts.ScriptTarget.Latest);
  
  let inputSchema: JSONSchema | null = null;
  let outputSchema: JSONSchema | null = null;
  
  // Walk AST to find Input and Output interfaces
  ts.forEachChild(sourceFile, node => {
    if (ts.isInterfaceDeclaration(node)) {
      if (node.name.text === 'Input') {
        inputSchema = interfaceToJsonSchema(node);
      } else if (node.name.text === 'Output') {
        outputSchema = interfaceToJsonSchema(node);
      }
    }
  });
  
  return { 
    input: inputSchema ?? { type: 'object' }, 
    output: outputSchema ?? { type: 'object' } 
  };
}

function interfaceToJsonSchema(node: ts.InterfaceDeclaration): JSONSchema {
  // Convert TypeScript interface to JSON Schema
  // Handles: string, number, boolean, arrays, nested objects, optional fields
  // ... implementation
}
```

### Validation Example

```typescript
// Workflow with type-safe connections
{
  "steps": [
    // Phase 0: Tool step (schema from MCP)
    [{ 
      "name": "fetch-users", 
      "tool": { "connectionId": "api", "toolName": "list-users" }
      // Output schema from MCP: { users: Array<{ id, name, email, active }> }
    }],
    
    // Phase 1: Transform step (schema from TypeScript)
    [{ 
      "name": "filter-active",
      "transform": `
        interface Input {
          users: Array<{ id: string; name: string; email: string; active: boolean }>;
        }
        interface Output {
          activeEmails: string[];
        }
        export default (input: Input): Output => ({
          activeEmails: input.users.filter(u => u.active).map(u => u.email)
        });
      `,
      "input": { "users": "@fetch-users.output.users" }
      // Validates: @fetch-users.output.users matches Input.users ✅
    }],
    
    // Phase 2: Tool step
    [{ 
      "name": "send-emails",
      "tool": { "connectionId": "email", "toolName": "send-batch" },
      "input": { "recipients": "@filter-active.output.activeEmails" }
      // Validates: @filter-active.output.activeEmails matches tool input schema ✅
    }]
  ]
}
```

### Validation Errors

Validation errors are returned at **creation time**, blocking the save:

```typescript
interface ValidationError {
  type: 'missing_ref' | 'type_mismatch' | 'missing_schema' | 'invalid_typescript';
  step: string;
  field: string;
  ref?: string;
  expected?: JSONSchema;
  actual?: JSONSchema;
  message: string;
}

// Example: Workflow creation rejected
POST /workflows
{
  "name": "my-workflow",
  "steps": [...]
}

// Response: 400 Bad Request
{
  "error": "Workflow validation failed",
  "errors": [
    {
      "type": "type_mismatch",
      "step": "send-emails",
      "field": "recipients",
      "ref": "@filter-active.output.count",
      "expected": { "type": "array", "items": { "type": "string" } },
      "actual": { "type": "number" },
      "message": "Expected string[] but got number"
    },
    {
      "type": "missing_ref",
      "step": "aggregate",
      "field": "data",
      "ref": "@nonexistent.output",
      "message": "Step 'nonexistent' not found in previous phases"
    },
    {
      "type": "invalid_typescript",
      "step": "transform-data",
      "field": "transform",
      "message": "Missing required 'Output' interface declaration"
    }
  ]
}
```

### Cached Schemas

On successful validation, schemas are cached in the workflow record:

```typescript
// Saved workflow includes computed schemas
{
  "name": "my-workflow",
  "steps": [...],
  "_schemas": {
    "fetch-users": {
      "input": {},
      "output": { "type": "object", "properties": { "users": { "type": "array" } } }
    },
    "filter-active": {
      "input": { "type": "object", "properties": { "users": { "type": "array" } } },
      "output": { "type": "object", "properties": { "emails": { "type": "array" } } }
    }
  }
}
```

This allows fast execution-time input validation without re-parsing.

---

## 8. Potential Issues & Mitigations

### Circular Triggers

**Problem**: Workflow A triggers B triggers A → infinite loop

**Mitigations**:
- Track trigger depth, enforce max (e.g., 10)
- UI warns if workflow graph has cycles
- Use transform step to set a "stop" flag in output

### Trigger Failures

**Problem**: Execution completes but trigger queuing fails

**Mitigation**: Track trigger status separately:
```typescript
{
  status: "completed",
  triggerStatus: "pending" | "triggered" | "failed",
  triggeredExecutionIds: ["exec-123", "exec-456"]
}
```

### Fan-In Pattern

**Problem**: Multiple executions need to converge

**Solution**: Keep fan-in within single execution using parallel phases, OR use a collector pattern:
- Triggered executions write to shared state (DB/queue)
- Separate collector workflow polls/aggregates

---

## 9. Summary

| Concept | Implementation |
|---------|----------------|
| **Parallel steps** | Group in same phase array |
| **Sequential steps** | Separate phase arrays |
| **Conditional logic** | Transform step shapes output |
| **Loop** | `forEach` modifier on step |
| **Wait** | `sleep` step type |
| **Data transform** | `transform` step (TypeScript, pure, only input) |
| **External call** | `tool` step (checkpointed) |
| **Chain workflows** | `triggers` array on workflow |
| **Fan-out** | Trigger with `forEach` |
| **Conditional triggers** | Transform output + @ref resolution |
| **Type safety** | TypeScript Input/Output interfaces |
| **Validation** | Extract schemas, verify @ref compatibility |

---

## 10. Full TypeScript Schema

```typescript
import z from "zod";

// Step Schema
export const StepSchema = z.object({
  name: z.string(),
  
  // What to do (pick one)
  tool: z.object({ 
    connectionId: z.string(), 
    toolName: z.string() 
  }).optional(),
  transform: z.string().optional(),
  sleep: z.object({ 
    ms: z.number().optional(), 
    until: z.string().optional() 
  }).optional(),
  
  // Input
  input: z.record(z.unknown()).optional(),
  
  // Modifiers
  forEach: z.string().optional(),
  as: z.string().default("item"),
  maxIterations: z.number().default(100),
  
  // Retry (tool only)
  retry: z.object({ 
    maxAttempts: z.number().default(3), 
    backoffMs: z.number().default(1000) 
  }).optional(),
});

// Trigger Schema
export const TriggerSchema = z.object({
  workflowId: z.string(),
  inputs: z.record(z.unknown()),
  forEach: z.string().optional(),
  workflow_timeout_ms: z.number().optional(),
  max_retries: z.number().optional(),
});

// Workflow Schema
export const WorkflowSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(z.array(StepSchema)),
  triggers: z.array(TriggerSchema).optional(),
  
  // Computed at creation time (not user-provided)
  _schemas: z.record(z.object({
    input: z.record(z.unknown()),  // JSON Schema
    output: z.record(z.unknown()), // JSON Schema
  })).optional(),
});

// Type exports
export type Step = z.infer<typeof StepSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
```

