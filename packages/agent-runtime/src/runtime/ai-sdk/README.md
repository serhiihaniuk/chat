# AI SDK Adapter

Read this when: editing the private AI SDK adapter inside `agent-runtime`.
Source of truth for: how this folder talks to AI SDK and maps stream parts.
Not source of truth for: provider policy, product policy, or protocol events.

## Files

| File                                  | Owns                                                                |
| ------------------------------------- | ------------------------------------------------------------------- |
| `streaming/tool-loop-agent-runner.ts` | Opens ToolLoopAgent for the default executor and preserves order.   |
| `streaming/tool-activity-mapper.ts`   | Maps AI SDK tool parts into one runtime activity row per tool call. |
| `streaming/reasoning-activity.ts`     | Buffers reasoning deltas into one safe activity row.                |
| `streaming/stream-part-mapper.ts`     | Maps text, finish, started, and error parts.                        |
| `tools/ai-sdk-tool-adapter.ts`        | Converts RuntimeTool into an AI SDK tool callback.                  |
| `tools/runtime-tool-executor.ts`      | Runs RuntimeTool Effects with abort and timeout handling.           |
| `tools/json-value.ts`                 | Normalizes unknown tool input/output into JSON-safe values.         |

## Boundary Rules

- This is the only runtime folder that speaks AI SDK.
- The default `AgentExecutor` calls into this folder; other executors must still
  emit RuntimeEvents at the runtime boundary.
- It must not choose tools, pick product profiles, or decide product policy.
- It awaits `agent.stream(...)` only long enough to get AI SDK's stream handle.
- The assistant answer still streams through `result.fullStream`.
- Downstream packages receive RuntimeEvents, not AI SDK stream parts.

## Canonical Docs

- `packages/agent-runtime/README.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `docs/architecture/assistant-turn.md`
