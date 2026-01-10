# Pilot Agent Guidelines

## Debugging Complex AI Flows

When debugging multi-step workflows, LLM calls, or async task execution where terminal logs may be truncated or lost:

**Use temporary file-based logging** to capture the full picture:

```typescript
const fs = await import("fs");
const logPath = "/tmp/pilot-debug.log";
const log = (msg: string) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logPath, line);
  console.error(msg); // Also emit to stderr for STDIO capture
};

log(`🔍 LLM CALL: model=${modelId}, messages=${messages.length}`);
log(`📝 PROMPT: ${prompt.slice(0, 300)}`);
const result = await callLLM(...);
log(`📤 RESULT: text=${!!result.text} (${result.text?.length || 0} chars)`);
```

This technique is essential when:
- Pilot runs as STDIO subprocess (Mesh only captures stderr)
- Terminal output is truncated or scrolling
- Async callbacks (setTimeout) fire after parent logs
- You need timestamps to trace execution order across concurrent flows

**Always use `console.error` instead of `console.log`** in Pilot - Mesh's STDIO transport only pipes stderr to the main console.

Remember to clean up debug logging before committing.

## Common Gotchas

### Model ID Resolution
When spawning child workflows via `start_task`, always pass the resolved model IDs from the parent config:

```typescript
// ❌ Wrong - passes literal strings
config: { fastModel: "fast", smartModel: "smart" }

// ✅ Correct - passes actual model IDs
config: { fastModel: config.fastModel, smartModel: config.smartModel }
```

### STDIO Logging
Pilot runs as an STDIO process under Mesh. Only `stderr` is captured:
- Use `console.error()` for debug output
- `console.log()` output will be lost

