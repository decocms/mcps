import { BaseCollectionEntitySchema } from "@decocms/bindings/collections";
import { StepSchema } from "../workflow-runner/index.ts";
import z from "zod";

const WorkflowSchema = BaseCollectionEntitySchema.extend({
  name: z.string(),
  description: z.string(),
  steps: z.array(StepSchema),
});

const workflowTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    steps TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    updated_by TEXT
  )
`;

const workflowTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflows(name);
`;

const WorkflowExecutionStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

const WorkflowExecutionSchema = BaseCollectionEntitySchema.extend({
  workflow_id: z.string(),
  status: WorkflowExecutionStatusSchema,
  output: z.record(z.unknown()).optional(),
  error: z
    .string()
    .nullish()
    .transform((val) => val ?? undefined),
  recovery_attempts: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  workflow_timeout_ms: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  workflow_deadline_epoch_ms: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
  inputs: z.record(z.unknown()).optional(),
  started_at_epoch_ms: z
    .number()
    .nullish()
    .transform((val) => val ?? undefined),
}).omit({
  title: true,
});
const workflowExecutionTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS workflow_executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    updated_by TEXT,
    output TEXT,
    error TEXT,
    recovery_attempts INTEGER,
    workflow_timeout_ms INTEGER,
    workflow_deadline_epoch_ms INTEGER,
    inputs TEXT,
    started_at_epoch_ms INTEGER
  )
`;

const workflowExecutionTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_created_at ON workflow_executions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_workflow_executions_updated_at ON workflow_executions(updated_at DESC);
`;

const ExecutionStepResultSchema = BaseCollectionEntitySchema.extend({
  execution_id: z.string(),
  step_id: z.string(),
  output: z.record(z.unknown()).nullish(),
  error: z.string().nullish(),
  child_workflow_id: z.string().nullish(),
  started_at_epoch_ms: z.number().nullish(),
  completed_at_epoch_ms: z.number().nullish(),
}).omit({
  title: true,
  id: true,
  updated_at: true,
  created_at: true,
  created_by: true,
  updated_by: true,
});

const executionStepResultsTableIdempotentQuery = `
  CREATE TABLE IF NOT EXISTS execution_step_results (
    execution_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    output TEXT,
    error TEXT,
    child_workflow_id TEXT,
    started_at_epoch_ms INTEGER,
    completed_at_epoch_ms INTEGER
  )
`;

const executionStepResultsTableIndexesQuery = `
  CREATE INDEX IF NOT EXISTS idx_execution_step_results_execution_id ON execution_step_results(execution_id);
  CREATE INDEX IF NOT EXISTS idx_execution_step_results_step_id ON execution_step_results(step_id);
  CREATE INDEX IF NOT EXISTS idx_execution_step_results_started_at_epoch_ms ON execution_step_results(started_at_epoch_ms DESC);
  CREATE INDEX IF NOT EXISTS idx_execution_step_results_completed_at_epoch_ms ON execution_step_results(completed_at_epoch_ms DESC);
`;

export {
  workflowTableIdempotentQuery,
  workflowTableIndexesQuery,
  workflowExecutionTableIdempotentQuery,
  workflowExecutionTableIndexesQuery,
  WorkflowExecutionSchema,
  WorkflowSchema,
  ExecutionStepResultSchema,
  executionStepResultsTableIdempotentQuery,
  executionStepResultsTableIndexesQuery,
};
