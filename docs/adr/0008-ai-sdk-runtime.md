# ADR 0008: AI SDK Runtime

Status: accepted

AI SDK is the agent runtime engine. The production runtime boundary is
Agent/ToolLoopAgent-first: provider adapters translate selected provider models
into AI SDK model calls, registered tools become available agent capabilities,
and the shared runtime maps AI SDK stream parts into normalized Side Chat
runtime events through an agent-shaped facade.

Direct `streamText` calls are not a product orchestration boundary. They may
exist only as private implementation detail inside `packages/agent-runtime`.
The public runtime surface exposes the runtime factory, provider/tool protocol
types, and normalized runtime events. Shared request, error, stream, and event
contracts live in `@side-chat/ai-runtime-contract`.

The runtime surface is Effect-first. `streamEffect` exposes
`Stream<RuntimeEvent, AiRuntimeError>`. Other stream shapes are transport
adapter concerns and must not become package-level runtime APIs.

Expected runtime failures are values in the Effect error channel. Provider,
tool, and runtime code should use `Effect.fail`, `Effect.try`, or
`Effect.tryPromise` for known failures. Raw JavaScript `throw` is treated as a
defect; the runtime maps defects at the package boundary as a safety net, but
throws are not accepted control flow for product behavior.

Raw provider HTTP streaming is rejected outside approved provider adapters because it duplicates orchestration behavior and leaks provider-specific event shapes into product code.

The runtime tool protocol is owned by `packages/agent-runtime`; concrete tools
are owned by the consuming app as injected ports/adapters. They are exposed to
the AI SDK `ToolLoopAgent`; the model decides whether and when to call them.
Backend keyword heuristics and pre-model tool execution are rejected because
they make activity appear before the agent has acted.

AI SDK tool callbacks are Promise-shaped, but Side Chat runtime tools are
Effect-shaped. The only accepted bridge is the private AI SDK adapter, where a
runtime tool Effect is interpreted with abort and declared timeout handling
before returning to AI SDK.

The accepted backend development capability is `mock_web_search`. It
deterministically simulates web search without external egress, but it is still a
normal registered tool. Runtime/profile/policy composition decides whether it is
available for a turn; production profiles must not expose development-only mock
tools. Its output returns through the AI SDK tool loop and its observed
tool-call/tool-result stream parts map into normalized runtime activity. Partner
AI core maps those runtime events into `sidechat.activity`; the browser protocol
still never exposes AI SDK-native tool parts.
