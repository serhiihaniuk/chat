# Runtime And Protocol Events

Read this when: editing runtime execution, provider adapters, event mapping,
Effect/Stream code, or `sidechat.v1` event shapes.
Source of truth for: private provider events, RuntimeEvents, protocol events,
and streaming style.
Not source of truth for: product policy, UI rendering details, or package
ownership tables.

## Event Chain

```txt
AI SDK stream part
-> RuntimeEvent
-> SidechatStreamEvent
-> chat-client decoded event
-> widget message/activity state
```

AI SDK stream parts and provider DTOs stay private to `agent-runtime`.
RuntimeEvents are internal server-side events. SidechatStreamEvents are the
browser-facing contract.

## Runtime Rules

- `agent-runtime` receives a prepared AgentRuntimeRequest.
- The selected AgentExecutor emits RuntimeEvents.
- The default executor calls the private AI SDK adapter.
- Other executors may use different engines but must still emit RuntimeEvents at
  the runtime boundary.
- Runtime does not decide product authorization, approval policy, host-command
  dispatch, persistence, or context access.

## Protocol Rules

- `chat-protocol` owns `sidechat.v1` request/event DTOs, constants, validators,
  ordering checks, SSE codec, and generated schema.
- Core maps RuntimeEvents to SidechatStreamEvents.
- The browser never receives provider-native parts, RuntimeEvents, Effect
  values, DB rows, Hono objects, or raw provider errors.
- Protocol event strings come from centralized constants.

## Tool And Activity Lifecycle

```txt
model emits tool call
-> RuntimeTool executes
-> tool result or tool error
-> runtime activity event
-> protocol activity event
-> widget activity item
```

Tool input, output, error, and sources stay inside activity details. They do not
become separate top-level conversation messages.

## Effect And Stream Style

- Core and runtime APIs are Effect-first: `streamChatEffect(input)` and
  `streamEffect(request)`.
- Promise and `AsyncIterable` conversions belong at transport edges.
- Expected failures use `Effect.fail`, `Effect.try`, or `Effect.tryPromise`.
- A raw `throw` is a defect, not product control flow.
- Prefer named stages over nested `Effect.map`, `Effect.flatMap`,
  `Stream.unwrap`, object spread, or callback chains.
- Step comments are useful only when they say what a stage proves, records,
  hides, prepares, or finalizes.

## Files To Open

- `packages/agent-runtime/src/runtime/README.md`
- `packages/agent-runtime/src/runtime/ai-sdk/README.md`
- `packages/agent-runtime/src/runtime/contract/runtime-event.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/runtime-event-mapper.ts`
- `packages/chat-protocol/src/sidechat-v1/events/`
