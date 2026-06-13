# Agent Runtime

Read this when: editing one prepared assistant turn, provider execution, runtime
tools, or RuntimeEvent mapping.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: product policy, context selection, persistence, or
browser protocol.

## Owns

- `AgentRuntime.streamEffect(request)`.
- Assistant profile, provider/model, tool, and prompt preparation for one turn.
- Private AI SDK `ToolLoopAgent` integration.
- Runtime tool protocol and normalized RuntimeEvents.
- Provider adapters and deterministic runtime test fakes.

## Does Not Own

- Product authorization, approval policy, or host-command dispatch.
- Context gathering, squashing, redaction, or manifests.
- Database writes.
- HTTP/SSE transport.
- Widget or `sidechat.v1` browser state.

## Public Surface

- `createAgentRuntime`
- `AgentRuntime`, `AgentRuntimeOptions`, and `AssistantProfile`
- `AgentRuntimeRequest`, `RuntimeContextBoard`, and runtime message types
- `RuntimeEvent`, `RuntimeEventStream`, and runtime errors
- `RuntimeTool` and `createToolRegistry`
- `ModelProvider` and accepted provider adapters
- package-local testing fakes

The root package does not export `runtime/ai-sdk/*`. AI SDK is private runtime
implementation detail.

## Main Flow

```txt
AgentRuntimeRequest
-> resolve assistant profile
-> resolve provider/model
-> select injected tools for this turn
-> render profile instructions and context board
-> open AI SDK ToolLoopAgent stream
-> map AI SDK stream parts into RuntimeEvent values
```

## Boundary Rules

- The native API is `streamEffect(request)`.
- Do not add package-level Promise or `AsyncIterable` facades.
- Transport adapters convert streams at their own edges.
- Expected failures use `Effect.fail`, `Effect.try`, or `Effect.tryPromise`.
- Raw `throw` is a defect.
- Provider DTOs and AI SDK stream parts do not leave this package.
- Approval requirements and host commands stay in product/host-bridge policy;
  runtime receives only selected backend `RuntimeTool` names for a turn.

## Local Conventions

- `runtime/turn/**` prepares the request and must not import AI SDK.
- `runtime/ai-sdk/**` runs the private AI SDK adapter and must not decide
  product policy.
- `RuntimeTool.execute` returns an Effect because tools are backend ports that
  can fail, depend on services, time out, or be cancelled.

## Tests

```sh
npm run typecheck --workspace @side-chat/agent-runtime
npm test --workspace @side-chat/agent-runtime
```

## Related Docs

- `docs/domain/vocabulary.md`
- `docs/architecture/capability-model.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/effect-style.md`
