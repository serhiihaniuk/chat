# AI SDK Adapter

This folder is the only place where `packages/agent-runtime` speaks AI SDK.

```txt
tool-loop-agent-runner.ts
  opens ToolLoopAgent and preserves runtime event order

ai-sdk-tool-adapter.ts
  converts RuntimeTool.execute into an AI SDK tool callback

runtime-tool-executor.ts
  interprets the app-owned RuntimeTool Effect for AI SDK, enforcing aborts and
  declared tool timeouts before converting back to the Promise callback shape

tool-activity-mapper.ts
  maps AI SDK tool stream parts into one runtime.activity row per tool call

reasoning-activity.ts
  buffers reasoning deltas into one safe activity row

stream-part-mapper.ts
  maps text, finish, started, and error events

json-value.ts
  normalizes unknown tool input/output into protocol-safe JSON
```

The adapter must not choose tools, pick models, or decide product policy. Those
questions are answered in `runtime/turn/` before this folder runs.

`tool-loop-agent-runner.ts` awaits `agent.stream(...)` only long enough to get
AI SDK's stream handle. The assistant answer is still streamed through
`result.fullStream`, then consumed by Effect as provider parts arrive.
