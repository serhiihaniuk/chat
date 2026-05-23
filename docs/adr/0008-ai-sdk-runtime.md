# ADR 0008: AI SDK Runtime

Status: accepted

AI SDK is the agent runtime engine. The production runtime boundary is Agent/ToolLoopAgent-first: provider adapters translate selected provider models into AI SDK model calls, and the shared runtime maps AI SDK stream parts into normalized Side Chat runtime events through an agent-shaped facade.

Direct `streamText` calls are not a product orchestration boundary. They may exist only as private implementation detail inside `packages/agent-runtime` while the public package surface exposes runtime factories, provider registries, tool registries, profiles, and normalized runtime events.

Raw provider HTTP streaming is rejected outside approved provider adapters because it duplicates orchestration behavior and leaks provider-specific event shapes into product code.
