# ADR 0008: AI SDK Runtime

Status: accepted

AI SDK is the agent runtime engine. The production runtime boundary is
Agent/ToolLoopAgent-first: provider adapters translate selected provider models
into AI SDK model calls, registered tools become available agent capabilities,
and the shared runtime maps AI SDK stream parts into normalized Side Chat
runtime events through an agent-shaped facade.

Direct `streamText` calls are not a product orchestration boundary. They may exist only as private implementation detail inside `packages/agent-runtime` while the public package surface exposes runtime factories, provider registries, tool registries, profiles, and normalized runtime events.

Raw provider HTTP streaming is rejected outside approved provider adapters because it duplicates orchestration behavior and leaks provider-specific event shapes into product code.

Runtime tools are owned by `packages/agent-runtime` as registered capabilities.
They are exposed to the AI SDK `ToolLoopAgent`; the model decides whether and
when to call them. Request-time tool names, backend keyword heuristics, and
pre-model tool execution are rejected because they make activity appear before
the agent has acted.

The accepted backend development capability is `mock_web_search`. It
deterministically simulates web search without external egress, but it is still a
normal registered tool. Runtime/profile/policy composition decides whether it is
available for a turn; production profiles must not expose development-only mock
tools. Its output returns through the AI SDK tool loop and its observed
tool-call/tool-result stream parts map into normalized runtime activity. Partner
AI core maps those runtime events into `sidechat.activity`; the browser protocol
still never exposes AI SDK-native tool parts.
