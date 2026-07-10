# AI SDK Adapter

Read this when: editing the private AI SDK adapter inside `agent-runtime`.
Source of truth for: how this folder talks to AI SDK and maps stream parts.
Not source of truth for: provider policy, product policy, or protocol events.

## Files

| File                                      | Owns                                                                |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `streaming/tool-loop-agent-runner.ts`     | Opens ToolLoopAgent, ends at the first terminal, merges tool sets.  |
| `streaming/tool-activity-mapper.ts`       | Maps AI SDK tool parts into one runtime activity row per tool call. |
| `streaming/reasoning-activity.ts`         | Buffers reasoning deltas into one safe activity row.                |
| `streaming/stream-part-mapper.ts`         | Maps text/finish/error/abort parts; classifies every part type.     |
| `streaming/coalescing/delta-coalescer.ts` | Batches same-block text/reasoning delta runs into one merged part.  |
| `tools/ai-sdk-tool-adapter.ts`            | Converts RuntimeTool into an AI SDK tool callback.                  |
| `tools/runtime-tool-executor.ts`          | Runs RuntimeTool Effects with abort and timeout handling.           |

## Boundary Rules

- This is the only runtime folder that speaks AI SDK.
- The default `AgentExecutor` calls into this folder; other executors must still
  emit RuntimeEvents at the runtime boundary.
- It must not choose tools, pick product profiles, or decide product policy.
- It awaits `agent.stream(...)` only long enough to get AI SDK's stream handle.
- The assistant answer still streams through `result.fullStream`.
- Downstream packages receive RuntimeEvents, not AI SDK stream parts.

## Terminal And Part-Mapping Rules

- **Exactly one terminal.** The runner ends the stream at the first
  `completed | error | blocked` (`Stream.takeUntil(isRuntimeTerminalEvent)`), so a
  late `finish` after an in-band `error` can never add a second terminal. The
  mapper also drops an `error` finish reason rather than emitting `completed`.
- **Abort is a terminal.** A caller abort arrives as an `abort` part, mapped to
  `runtime.completed(aborted)`; an `AbortError` during stream open/iteration maps
  to the `aborted` error code, never a retryable provider outage.
- **Every part type is classified.** `classifyAiSdkPart` is backed by an
  exhaustive `Record<AiSdkPartType, …>`, so a future SDK pin's new part type fails
  to compile until it is mapped or added to the ignore list; an unrecognized type
  at runtime is logged once per turn, never silently dropped.
- **Tool names are unique per turn.** A runtime tool and a host command sharing a
  name fail the turn with a typed `tool_conflict`, instead of one silently
  shadowing the other.

## Canonical Docs

- `packages/agent-runtime/README.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `docs/architecture/assistant-turn.md`
