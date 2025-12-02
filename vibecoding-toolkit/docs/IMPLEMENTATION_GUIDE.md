# Workflow Execution - Implementation Guide

> Practical guide for implementing the design in [WORKFLOW_EXECUTION_DESIGN.md](./WORKFLOW_EXECUTION_DESIGN.md)

---

## Quick Fixes (Do First)

These changes address the most critical bugs with minimal refactoring.

### Fix 1: Process All Queue Messages

**File**: `server/main.ts`

```typescript
// ❌ BEFORE: Returns after first message
async queue(
  batch: MessageBatch<{ executionId: string; authorization: string }>,
  env: Env,
) {
  for (const message of batch.messages) {
    try {
      // ... execution logic ...
      return { success: true };  // BUG: Exits loop!
    } catch (error) {
      console.error({ error });
    }
  }
}

// ✅ AFTER: Processes all messages
async queue(
  batch: MessageBatch<{ executionId: string; authorization: string }>,
  env: Env,
) {
  for (const message of batch.messages) {
    try {
      const response = await fetch(
        env.DECO_APP_ENTRYPOINT + "/mcp/call-tool/START_EXECUTION",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${message.body.authorization}`,
            "Content-Type": "application/json",
            "X-Deco-MCP-Client": "true",
          },
          body: JSON.stringify({
            executionId: message.body.executionId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to start execution: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[QUEUE] Execution ${message.body.executionId} completed`);
      message.ack();  // ✅ Explicit acknowledgment
      
    } catch (error) {
      console.error(`[QUEUE] Execution ${message.body.executionId} failed:`, error);
      message.retry({ delaySeconds: 30 });  // ✅ Retry on failure
    }
  }
  // ✅ No return inside loop
}
```

---

## Database Schema Changes

### Add Execution Lock Columns

```sql
-- Run this migration before deploying locking code
ALTER TABLE workflow_executions 
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP,
ADD COLUMN IF NOT EXISTS lock_id TEXT,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP;

-- Add step-level retry tracking
ALTER TABLE execution_step_results
ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS errors JSONB DEFAULT '[]';

-- Index for finding unlocked executions
CREATE INDEX IF NOT EXISTS idx_executions_lock 
ON workflow_executions (locked_until) 
WHERE status IN ('pending', 'running');
```

---

## New Utility Functions

### File: `server/lib/workflow-lock.ts`

```typescript
import type { Env } from "../main.ts";

export interface LockResult {
  acquired: boolean;
  lockId?: string;
}

const DEFAULT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Attempt to acquire an exclusive lock on a workflow execution.
 * Uses optimistic locking - only succeeds if no valid lock exists.
 */
export async function acquireLock(
  env: Env,
  executionId: string,
  durationMs: number = DEFAULT_LOCK_DURATION_MS
): Promise<LockResult> {
  const lockId = crypto.randomUUID();
  const now = new Date();
  const lockUntil = new Date(now.getTime() + durationMs);

  try {
    const result = await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          locked_at = $1, 
          locked_until = $2, 
          lock_id = $3,
          updated_at = $1
        WHERE id = $4 
          AND (locked_until IS NULL OR locked_until < $1)
          AND status IN ('pending', 'running')
        RETURNING id
      `,
      params: [
        now.toISOString(),
        lockUntil.toISOString(),
        lockId,
        executionId,
      ],
    });

    const acquired = (result.result[0]?.results?.length ?? 0) > 0;
    
    console.log(`[LOCK] ${acquired ? 'Acquired' : 'Failed to acquire'} lock for ${executionId}`);
    
    return {
      acquired,
      lockId: acquired ? lockId : undefined,
    };
  } catch (error) {
    console.error(`[LOCK] Error acquiring lock for ${executionId}:`, error);
    return { acquired: false };
  }
}

/**
 * Release a lock on a workflow execution.
 * Only releases if the lockId matches (prevents releasing someone else's lock).
 */
export async function releaseLock(
  env: Env,
  executionId: string,
  lockId: string
): Promise<boolean> {
  try {
    const result = await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          locked_at = NULL, 
          locked_until = NULL, 
          lock_id = NULL,
          updated_at = $1
        WHERE id = $2 AND lock_id = $3
        RETURNING id
      `,
      params: [new Date().toISOString(), executionId, lockId],
    });

    const released = (result.result[0]?.results?.length ?? 0) > 0;
    
    if (released) {
      console.log(`[LOCK] Released lock for ${executionId}`);
    } else {
      console.warn(`[LOCK] Lock mismatch or already released for ${executionId}`);
    }
    
    return released;
  } catch (error) {
    console.error(`[LOCK] Error releasing lock for ${executionId}:`, error);
    return false;
  }
}

/**
 * Extend an existing lock (refresh timeout).
 * Useful for long-running steps.
 */
export async function extendLock(
  env: Env,
  executionId: string,
  lockId: string,
  additionalMs: number = DEFAULT_LOCK_DURATION_MS
): Promise<boolean> {
  const newLockUntil = new Date(Date.now() + additionalMs);

  try {
    const result = await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET locked_until = $1, updated_at = $2
        WHERE id = $3 AND lock_id = $4
        RETURNING id
      `,
      params: [
        newLockUntil.toISOString(),
        new Date().toISOString(),
        executionId,
        lockId,
      ],
    });

    return (result.result[0]?.results?.length ?? 0) > 0;
  } catch (error) {
    console.error(`[LOCK] Error extending lock for ${executionId}:`, error);
    return false;
  }
}
```

### File: `server/lib/retry.ts`

```typescript
export interface RetryConfig {
  maxRetries: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
  jitterSeconds: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 10,
  baseDelaySeconds: 2,
  maxDelaySeconds: 300, // 5 minutes
  jitterSeconds: 3,
};

/**
 * Calculate exponential backoff delay with jitter.
 * 
 * Sequence (with base=2, max=300):
 * Retry 0: ~2-5s
 * Retry 1: ~4-7s  
 * Retry 2: ~8-11s
 * Retry 3: ~16-19s
 * Retry 4: ~32-35s
 * Retry 5: ~64-67s
 * Retry 6: ~128-131s
 * Retry 7: ~256-259s
 * Retry 8+: ~300s (capped)
 */
export function calculateBackoff(
  retryCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const { baseDelaySeconds, maxDelaySeconds, jitterSeconds } = config;
  
  // Exponential: 2^retryCount * base
  const exponentialDelay = Math.pow(2, retryCount) * baseDelaySeconds;
  
  // Random jitter: 0 to jitterSeconds
  const jitter = Math.floor(Math.random() * (jitterSeconds + 1));
  
  // Cap at maximum
  return Math.min(exponentialDelay + jitter, maxDelaySeconds);
}

/**
 * Determine if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Network/transient errors - retry
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up')
    ) {
      return true;
    }
    
    // Lock contention - retry
    if (message.includes('locked')) {
      return true;
    }
    
    // Rate limiting - retry
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }
    
    // Server errors - retry
    if (message.includes('500') || message.includes('502') || 
        message.includes('503') || message.includes('504')) {
      return true;
    }
  }
  
  // Default: don't retry (validation errors, auth errors, etc.)
  return false;
}

/**
 * Check if we should continue retrying.
 */
export function shouldRetry(
  retryCount: number,
  error: unknown,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): { retry: boolean; delaySeconds?: number; reason?: string } {
  if (retryCount >= config.maxRetries) {
    return { 
      retry: false, 
      reason: `Max retries (${config.maxRetries}) exceeded` 
    };
  }
  
  if (!isRetryableError(error)) {
    return { 
      retry: false, 
      reason: 'Non-retryable error' 
    };
  }
  
  return {
    retry: true,
    delaySeconds: calculateBackoff(retryCount, config),
  };
}
```

---

## Updated Workflow Execution

### File: `server/tools/workflow.ts` (Updated `runWorkflowTool`)

```typescript
import { acquireLock, releaseLock } from "../lib/workflow-lock.ts";
import { shouldRetry, DEFAULT_RETRY_CONFIG } from "../lib/retry.ts";

export const runWorkflowTool = (env: Env) =>
  createPrivateTool({
    id: "START_EXECUTION",
    description: "Run one or more MCP tools with durable execution",
    inputSchema: z.object({
      executionId: z.string(),
      retryCount: z.number().default(0),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      result: z.unknown(),
      nextStep: z.boolean().optional(),
    }),
    execute: async ({ context: ctx }) => {
      const { executionId, retryCount = 0 } = ctx;
      let lockId: string | undefined;
      
      try {
        // 1. Acquire lock
        const lock = await acquireLock(env, executionId);
        if (!lock.acquired) {
          throw new Error('LOCKED: Execution is locked by another worker');
        }
        lockId = lock.lockId;

        // 2. Load execution
        const { item: execution } =
          await env.SELF.DECO_COLLECTION_WORKFLOW_EXECUTIONS_GET({
            id: executionId,
          });
        
        if (!execution) {
          throw new Error(`Execution ${executionId} not found`);
        }

        // 3. Validate status
        if (!['pending', 'running'].includes(execution.status)) {
          console.log(`[WORKFLOW] Execution ${executionId} is ${execution.status}, skipping`);
          return { success: true, result: null, nextStep: false };
        }

        // 4. Load workflow
        const { item: workflow } = await env.SELF.DECO_COLLECTION_WORKFLOWS_GET({
          id: execution.workflow_id,
        });
        
        if (!workflow) {
          throw new Error(`Workflow ${execution.workflow_id} not found`);
        }

        // 5. Determine current step
        const { items: existingResults } =
          await env.SELF.DECO_COLLECTION_EXECUTION_STEP_RESULTS_GET_ALL({
            id: executionId,
          });

        const lastResult = existingResults[existingResults.length - 1];
        const steps = typeof workflow.steps === 'string' 
          ? JSON.parse(workflow.steps) 
          : workflow.steps;
        
        const currentStepIndex = determineCurrentStepIndex(steps, lastResult);
        
        if (currentStepIndex >= steps.length) {
          // All steps completed
          await env.SELF.DECO_COLLECTION_WORKFLOW_EXECUTIONS_UPDATE({
            id: executionId,
            data: { status: 'completed', output: lastResult?.output },
          });
          return { success: true, result: lastResult?.output, nextStep: false };
        }

        const step = steps[currentStepIndex];
        
        // 6. Execute step
        const result = await executeStep(env, execution, step, existingResults);
        
        // 7. Persist result
        await persistStepResult(env, executionId, step.name, result);
        
        // 8. Queue next step if needed
        const isLastStep = currentStepIndex >= steps.length - 1;
        if (!isLastStep) {
          await env.WORKFLOW_QUEUE.send({
            executionId,
            retryCount: 0, // Reset retry count for next step
            enqueuedAt: Date.now(),
          });
        } else {
          await env.SELF.DECO_COLLECTION_WORKFLOW_EXECUTIONS_UPDATE({
            id: executionId,
            data: { status: 'completed', output: result },
          });
        }

        return { 
          success: true, 
          result, 
          nextStep: !isLastStep 
        };

      } catch (error) {
        console.error(`[WORKFLOW] Execution ${executionId} failed:`, error);
        
        // Track error
        await trackExecutionError(env, executionId, error, retryCount);
        
        // Check if we should retry
        const retryDecision = shouldRetry(retryCount, error);
        
        if (retryDecision.retry) {
          // Queue retry
          await env.WORKFLOW_QUEUE.send({
            executionId,
            retryCount: retryCount + 1,
            enqueuedAt: Date.now(),
          });
          console.log(`[WORKFLOW] Queued retry ${retryCount + 1} for ${executionId}`);
        } else {
          // Mark as failed
          await env.SELF.DECO_COLLECTION_WORKFLOW_EXECUTIONS_UPDATE({
            id: executionId,
            data: { 
              status: 'failed',
              last_error: error instanceof Error ? error.message : String(error),
            },
          });
          console.log(`[WORKFLOW] Execution ${executionId} permanently failed: ${retryDecision.reason}`);
        }
        
        throw error;
        
      } finally {
        // Always release lock
        if (lockId) {
          await releaseLock(env, executionId, lockId);
        }
      }
    },
  });

// Helper functions

function determineCurrentStepIndex(
  steps: Step[], 
  lastResult: { step_id: string; completed_at_epoch_ms?: number | null } | undefined
): number {
  if (!lastResult) return 0;
  
  const matchingStepIndex = steps.findIndex(s => s.name === lastResult.step_id);
  
  // If last result is incomplete, resume it
  if (lastResult.completed_at_epoch_ms === null) {
    return matchingStepIndex;
  }
  
  // Otherwise, move to next step
  return matchingStepIndex + 1;
}

async function trackExecutionError(
  env: Env,
  executionId: string,
  error: unknown,
  retryCount: number
): Promise<void> {
  try {
    await env.DATABASE.DATABASES_RUN_SQL({
      sql: `
        UPDATE workflow_executions 
        SET 
          retry_count = $1,
          last_error = $2,
          last_retry_at = $3,
          updated_at = $3
        WHERE id = $4
      `,
      params: [
        retryCount,
        error instanceof Error ? error.message : String(error),
        new Date().toISOString(),
        executionId,
      ],
    });
  } catch (trackError) {
    console.error(`[WORKFLOW] Failed to track error:`, trackError);
  }
}
```

---

## Updated Queue Message Schema

### File: `server/main.ts` (Types)

```typescript
// Update the queue message type
export interface WorkflowQueueMessage {
  executionId: string;
  retryCount: number;
  enqueuedAt: number;  // epoch ms
}

// Update wrangler.toml queue binding type accordingly
```

---

## Testing Checklist

After implementation, verify:

- [ ] **All messages processed**: Send batch of 5 messages, verify all 5 execute
- [ ] **Retry on failure**: Simulate 500 error, verify exponential backoff
- [ ] **Max retries respected**: After 10 failures, verify execution marked as failed
- [ ] **Lock prevents double execution**: Start same execution twice concurrently, verify only one runs
- [ ] **Lock released on error**: Cause execution to fail, verify lock is released
- [ ] **Lock timeout works**: Kill worker mid-execution, verify lock expires and execution resumes
- [ ] **Step results persisted**: Verify each step result is saved before next step queued

---

## Rollout Strategy

1. **Deploy database migrations first** (safe, additive)
2. **Deploy lock utilities** (no behavior change yet)
3. **Deploy queue handler fix** (critical bug fix)
4. **Deploy retry logic** (adds resilience)
5. **Enable locking** (prevents race conditions)
6. **Monitor for 24h** before removing feature flags




