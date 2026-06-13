# AI SDK Adapter

Read this when: editing the private AI SDK adapter inside `agent-runtime`.
Source of truth for: how this folder talks to AI SDK and maps stream parts.
Not source of truth for: provider policy, product policy, or protocol events.

## Files

| File                        | Owns                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `tool-loop-agent-runner.ts` | Opens ToolLoopAgent and preserves runtime event order.              |
| `ai-sdk-tool-adapter.ts`    | Converts RuntimeTool into an AI SDK tool callback.                  |
| `runtime-tool-executor.ts`  | Runs RuntimeTool Effects with abort and timeout handling.           |
| `tool-activity-mapper.ts`   | Maps AI SDK tool parts into one runtime activity row per tool call. |
| `reasoning-activity.ts`     | Buffers reasoning deltas into one safe activity row.                |
| `stream-part-mapper.ts`     | Maps text, finish, started, and error parts.                        |
| `json-value.ts`             | Normalizes unknown tool input/output into JSON-safe values.         |

## Boundary Rules

- This is the only runtime folder that speaks AI SDK.
- It must not choose tools, pick product profiles, or decide product policy.
- It awaits `agent.stream(...)` only long enough to get AI SDK's stream handle.
- The assistant answer still streams through `result.fullStream`.
- Downstream packages receive RuntimeEvents, not AI SDK stream parts.

## Related Docs

- `packages/agent-runtime/README.md`
- `docs/architecture/effect-style.md`
- `docs/domain/lifecycle.md`
