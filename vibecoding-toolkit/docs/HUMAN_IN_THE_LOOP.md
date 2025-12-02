# Human-in-the-Loop Workflows

> **Status**: Implemented  
> **Date**: November 2025  
> **Feature**: `waitForSignal` step action

---

## Overview

Human-in-the-loop (HITL) workflows allow external intervention during execution. This is essential for:

- **Approval workflows** - Manager approval before processing orders
- **Content review** - Human review before publishing
- **Manual verification** - Identity verification, document checks
- **Escalation handling** - Human takeover when automation fails
- **Quality assurance** - Sample review in batch processing

The `waitForSignal` step action enables this by **pausing workflow execution** until an external signal is received.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HUMAN-IN-THE-LOOP FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────┐      ┌──────────────┐      ┌─────────────┐      ┌──────────┐  │
│   │ Phase 1 │─────▶│ waitForSignal │─────▶│   PAUSED    │─────▶│ Phase 3  │  │
│   │ (auto)  │      │   (Phase 2)   │      │  (waiting)  │      │  (auto)  │  │
│   └─────────┘      └──────────────┘      └─────────────┘      └──────────┘  │
│                           │                     ▲                           │
│                           │                     │                           │
│                           ▼                     │                           │
│                    ┌─────────────┐              │                           │
│                    │   Release   │              │                           │
│                    │    Lock     │              │                           │
│                    └─────────────┘              │                           │
│                                                 │                           │
│   ┌─────────────────────────────────────────────┼───────────────────────┐   │
│   │                    EXTERNAL                 │                       │   │
│   │                                             │                       │   │
│   │   ┌──────────┐    ┌───────────────┐    ┌────┴────┐                  │   │
│   │   │   User   │───▶│  sendSignal() │───▶│ Re-queue │                  │   │
│   │   │  Action  │    │               │    │execution │                  │   │
│   │   └──────────┘    └───────────────┘    └─────────┘                  │   │
│   │                                                                      │   │
│   │   Sources:                                                           │   │
│   │   - Web UI (approval button)                                         │   │
│   │   - API endpoint                                                     │   │
│   │   - Webhook                                                          │   │
│   │   - Email link                                                       │   │
│   │   - Slack bot                                                        │   │
│   │                                                                      │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Execution Flow

1. **Workflow executes normally** until it hits a `waitForSignal` step
2. **Step checks for signal** - if signal exists, consumes it and continues
3. **If no signal** - throws `WaitingForSignalError`
4. **Lock is released** - other workflows can proceed
5. **Execution stays in "running" status** - but isn't consuming resources
6. **External action sends signal** via `sendSignal()` function
7. **Execution is re-queued** automatically
8. **Workflow resumes** - signal payload becomes step output

---

## Schema

### WaitForSignal Step Action

```typescript
const WaitForSignalActionSchema = z.object({
  signalName: z.string()
    .describe("Name of the signal to wait for (must be unique per execution)"),
  
  timeoutMs: z.number().optional()
    .describe("Maximum time to wait in milliseconds (default: no timeout)"),
  
  description: z.string().optional()
    .describe("Human-readable description of what this signal is waiting for"),
});
```

### Step Output

When the signal is received, the step outputs:

```typescript
{
  signalName: "approval",
  payload: { approved: true, approver: "john@example.com" },
  receivedAt: 1701234567890,
  waitDurationMs: 3600000  // How long it waited
}
```

---

## Usage Examples

### 1. Simple Approval Workflow

```json
{
  "name": "order-approval",
  "steps": [
    [
      {
        "name": "prepare-order",
        "action": { "connectionId": "orders", "toolName": "prepare" },
        "input": { "orderId": "@input.orderId" }
      }
    ],
    [
      {
        "name": "wait-for-approval",
        "action": {
          "signalName": "manager_approval",
          "timeoutMs": 86400000,
          "description": "Waiting for manager approval"
        }
      }
    ],
    [
      {
        "name": "process-order",
        "action": { "connectionId": "orders", "toolName": "process" },
        "input": {
          "orderId": "@input.orderId",
          "approvedBy": "@wait-for-approval.output.payload.approver"
        }
      }
    ]
  ]
}
```

### 2. Content Review Pipeline

```json
{
  "name": "content-review",
  "steps": [
    [
      {
        "name": "generate-content",
        "action": { "connectionId": "ai", "toolName": "generate" }
      }
    ],
    [
      {
        "name": "human-review",
        "action": {
          "signalName": "content_reviewed",
          "description": "Content needs human review before publishing"
        }
      }
    ],
    [
      {
        "name": "decide",
        "action": {
          "code": "interface Input { review: { approved: boolean; edits?: string } }\ninterface Output { content: string; publish: boolean }\nexport default (input: Input): Output => ({ content: input.review.edits || '', publish: input.review.approved })"
        },
        "input": { "review": "@human-review.output.payload" }
      }
    ],
    [
      {
        "name": "publish",
        "action": { "connectionId": "cms", "toolName": "publish" },
        "input": { "content": "@decide.output.content" }
      }
    ]
  ]
}
```

### 3. Escalation with Timeout

```json
{
  "name": "support-ticket",
  "steps": [
    [
      {
        "name": "ai-response",
        "action": { "connectionId": "ai", "toolName": "generate-response" }
      }
    ],
    [
      {
        "name": "await-human-takeover",
        "action": {
          "signalName": "human_takeover",
          "timeoutMs": 300000,
          "description": "AI response generated. Human can take over within 5 minutes."
        }
      }
    ],
    [
      {
        "name": "send-response",
        "action": { "connectionId": "support", "toolName": "reply" },
        "input": {
          "response": "@ai-response.output.text",
          "overrideResponse": "@await-human-takeover.output.payload.response"
        }
      }
    ]
  ]
}
```

---

## Sending Signals

### From Code

```typescript
import { sendSignal, SignalType } from "./server/lib";

// Send approval signal
await sendSignal(env, executionId, SignalType.SIGNAL, {
  name: "manager_approval",
  payload: {
    approved: true,
    approver: "john@example.com",
    comments: "Looks good!",
  },
  authorization: userToken,  // Required to re-queue execution
});
```

### From API Endpoint (Example)

```typescript
// POST /api/workflows/:executionId/signal
app.post("/api/workflows/:executionId/signal", async (req, res) => {
  const { executionId } = req.params;
  const { signalName, payload } = req.body;
  const userToken = req.headers.authorization;

  await sendSignal(env, executionId, SignalType.SIGNAL, {
    name: signalName,
    payload,
    authorization: userToken,
  });

  res.json({ success: true });
});
```

### From Webhook Handler

```typescript
// Handle Stripe webhook for payment confirmation
app.post("/webhooks/stripe", async (req, res) => {
  const event = req.body;
  
  if (event.type === "payment_intent.succeeded") {
    const executionId = event.data.object.metadata.executionId;
    
    await sendSignal(env, executionId, SignalType.SIGNAL, {
      name: "payment_confirmed",
      payload: {
        paymentId: event.data.object.id,
        amount: event.data.object.amount,
      },
      authorization: process.env.SYSTEM_TOKEN,
    });
  }
  
  res.json({ received: true });
});
```

---

## Step Status Tracking

When a workflow is waiting for a signal, you can inspect the step status:

```typescript
import { getStepResult } from "./server/lib";

const stepResult = await getStepResult(env, executionId, "wait-for-approval");

// Status will be "running" while waiting
console.log(stepResult.status);  // "running"
console.log(stepResult.started_at_epoch_ms);  // When the wait started
```

---

## Timeout Handling

If a `timeoutMs` is specified and no signal is received within that time:

1. The step throws a timeout error
2. The workflow marks as **failed**
3. Can be retried or handled via error handling

```json
{
  "name": "wait-with-timeout",
  "action": {
    "signalName": "approval",
    "timeoutMs": 3600000  // 1 hour
  }
}
```

**Note**: Timeouts are checked each time the executor runs. For very long timeouts, consider using the orphan recovery cron to periodically check waiting executions.

---

## Execution Management

### Cancel a Waiting Execution

```typescript
// User can cancel while waiting
await env.SELF.CANCEL_EXECUTION({ executionId });
```

### Resume a Cancelled Execution

```typescript
// Resume and re-queue
await env.SELF.RESUME_EXECUTION({ 
  executionId, 
  requeue: true 
});
```

---

## Best Practices

### 1. Unique Signal Names

Use descriptive, unique signal names per workflow:

```typescript
// Good
{ signalName: "order_123_manager_approval" }
{ signalName: "document_review_legal_team" }

// Bad
{ signalName: "approval" }  // Too generic
```

### 2. Include Context in Payload

```typescript
await sendSignal(env, executionId, SignalType.SIGNAL, {
  name: "approval",
  payload: {
    approved: true,
    approver: user.email,
    timestamp: Date.now(),
    comments: "Approved after review",
    // Include audit trail
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  },
});
```

### 3. Set Reasonable Timeouts

```typescript
// Avoid infinite waits in production
{
  signalName: "urgent_approval",
  timeoutMs: 4 * 60 * 60 * 1000,  // 4 hours
  description: "Urgent: approval needed within 4 hours"
}
```

### 4. Use Description for UI

The `description` field can be shown in a UI to explain what the workflow is waiting for:

```typescript
{
  signalName: "kyc_verification",
  description: "Customer identity verification pending. Upload documents to proceed."
}
```

---

## Comparison with Other Patterns

| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| **waitForSignal** | Human approval, external events | Pauses execution, waits for signal |
| **Polling (sleep + check)** | Waiting for external state | Sleep loop, less efficient |
| **Webhook trigger** | Start new workflow | New execution per event |
| **Triggers** | Chain workflows | Fire-and-forget, no wait |

---

## Internal Implementation

### Signal Storage

Signals are stored in the `workflow_signals` table:

```sql
CREATE TABLE workflow_signals (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_name TEXT,
  payload TEXT,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
);
```

### Signal Types

| Type | Purpose |
|------|---------|
| `cancel` | Request workflow cancellation |
| `signal` | External data injection (HITL) |
| `pause` | Request workflow pause |
| `resume` | Request workflow resume |

### Re-queue Mechanism

When a signal is sent with `authorization`, the execution is automatically re-queued:

```typescript
// In sendSignal()
if (shouldResume && options?.authorization) {
  const status = await getExecutionStatus(env, executionId);
  if (status === "running") {
    await env.WORKFLOW_QUEUE.send({
      executionId,
      retryCount: 0,
      enqueuedAt: Date.now(),
      authorization: options.authorization,
    });
  }
}
```

---

## Troubleshooting

### Workflow Not Resuming After Signal

1. Check signal was created: `getSignals(env, executionId)`
2. Verify signal name matches exactly
3. Ensure authorization was provided for re-queuing
4. Check execution status is "running" (not cancelled/completed)

### Timeout Not Working

- Timeout is checked when executor runs
- For long timeouts, ensure orphan recovery cron is running
- Verify `timeoutMs` is in milliseconds

### Signal Consumed But Workflow Didn't Get Data

- Step output contains signal payload at `@stepName.output.payload`
- Check subsequent steps reference the correct path








