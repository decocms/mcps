# Middleware Architecture

## 🏗️ Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                  shared/tools/utils/middleware.ts               │
│                                                                 │
│  • withRetry()                                                  │
│  • withLogging()                                                │
│  • withTimeout()                                                │
│  • applyMiddlewares()                                           │
│  • Contract types                                               │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                              │ Re-export
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            │                 │                 │
┌───────────▼──────────┐  ┌──▼──────────────┐  ┌▼──────────────────┐
│ video-generators/    │  │ image-generators/│  │ image-analyzers/  │
│ middleware.ts        │  │ middleware.ts    │  │ middleware.ts     │
└───────────┬──────────┘  └──┬──────────────┘  └┬──────────────────┘
            │                 │                  │
            │ Import          │ Import           │ Import
            │                 │                  │
┌───────────▼──────────┐  ┌──▼──────────────┐  ┌▼──────────────────┐
│ video-generators/    │  │ image-generators/│  │ image-analyzers/  │
│ base.ts              │  │ base.ts          │  │ base.ts           │
│                      │  │                  │  │                   │
│ createVideoGenerator │  │ createImageGen   │  │ createImageAnalyzer│
│ Tools()              │  │ Tools()          │  │ Tools()           │
└───────────┬──────────┘  └──┬──────────────┘  └┬──────────────────┘
            │                 │                  │
            │ Used by         │ Used by          │ Used by
            │                 │                  │
┌───────────▼──────────┐  ┌──▼──────────────┐  ┌▼──────────────────┐
│ MCPs:                │  │ MCPs:            │  │ MCPs:             │
│ • sora               │  │ • nanobanana     │  │ • gemini-pro-vision│
│ • veo                │  │                  │  │                   │
└──────────────────────┘  └──────────────────┘  └───────────────────┘
```

## 🔄 Before vs After

### ❌ Before (Duplicated Code)

```
video-generators/middleware.ts       (107 lines)
  ├── withRetry()                    duplicated
  ├── withLogging()                  duplicated
  ├── withTimeout()                  duplicated
  └── applyMiddlewares()             duplicated

image-generators/middleware.ts       (107 lines)
  ├── withRetry()                    duplicated
  ├── withLogging()                  duplicated
  ├── withTimeout()                  duplicated
  └── applyMiddlewares()             duplicated

image-analyzers/middleware.ts        (re-export from video)
  └── (pointing to video-generators)
```

**Total:** ~214 lines of duplicated code

### ✅ After (Centralized)

```
tools/utils/middleware.ts            (155 lines)
  ├── withRetry()                    ⭐ Single source
  ├── withLogging()                  ⭐ Single source
  ├── withTimeout()                  ⭐ Single source
  ├── applyMiddlewares()             ⭐ Single source
  └── Contract types                 ⭐ Single source

video-generators/middleware.ts       (7 lines - re-export)
image-generators/middleware.ts       (7 lines - re-export)
image-analyzers/middleware.ts        (7 lines - re-export)
```

**Total:** 176 lines (155 + 7 + 7 + 7)

**Savings:** -38 lines + single source of truth ✨

## 📊 Usage Statistics

### Current MCPs Using Middlewares

| MCP | Module | Middlewares Used |
|-----|--------|-----------------|
| `sora` | video-generators | retry, logging, timeout |
| `veo` | video-generators | retry, logging, timeout |
| `nanobanana` | image-generators | retry, logging, timeout |
| `gemini-pro-vision` | image-analyzers | retry, logging, timeout |

### Future MCPs

Any new MCP can import directly from:
```typescript
import { withRetry } from "@decocms/mcps-shared/tools/utils/middleware";
```

## 🎯 Benefits

### 1. **Single Source of Truth**
- One place to fix bugs
- One place to add features
- Consistent behavior across all MCPs

### 2. **Better Organization**
- Middlewares are in `tools/utils/` with other utilities
- Clear separation: tools ≠ generators ≠ analyzers

### 3. **Flexibility**
- Direct import for custom tools
- Re-export for convenience in generators
- Easy to test in isolation

### 4. **Maintainability**
```typescript
// Before: Need to update in 2+ places
video-generators/middleware.ts  ✏️
image-generators/middleware.ts  ✏️

// After: Update in 1 place
tools/utils/middleware.ts       ✏️
```

## 🔧 Migration Guide

### For New MCPs

Use direct import:
```typescript
import {
  withRetry,
  withLogging,
  withTimeout,
} from "@decocms/mcps-shared/tools/utils/middleware";
```

### For Existing Generator-based MCPs

Both work (backward compatible):
```typescript
// Option 1: Through generator module (works, but indirect)
import { withRetry } from "@decocms/mcps-shared/video-generators";

// Option 2: Direct from source (preferred)
import { withRetry } from "@decocms/mcps-shared/tools/utils/middleware";
```

### For Custom Tools

```typescript
import {
  applyMiddlewares,
  withRetry,
  withLogging,
} from "@decocms/mcps-shared/tools/utils/middleware";

const myTool = createPrivateTool({
  id: "MY_TOOL",
  execute: async ({ context }) => {
    const doExecute = async () => {
      // Your logic
    };

    const withMiddlewares = applyMiddlewares({
      fn: doExecute,
      middlewares: [
        withLogging({ title: "My Tool" }),
        withRetry(3),
      ],
    });

    return withMiddlewares();
  },
});
```

## 🧪 Testing Impact

### Before
```typescript
// Had to test in video-generators context
import { withRetry } from "../video-generators/middleware";
```

### After
```typescript
// Clean, focused test
import { withRetry } from "@decocms/mcps-shared/tools/utils/middleware";

describe("withRetry", () => {
  it("retries on failure", async () => {
    // Test middleware in isolation
  });
});
```

## 📚 Related Documentation

- [Middleware README](./README.md) - Usage guide
- [Video Generators](../../video-generators/README.md)
- [Image Analyzers](../../image-analyzers/README.md)
- [API Client](./api-client.ts) - Complementary utilities

