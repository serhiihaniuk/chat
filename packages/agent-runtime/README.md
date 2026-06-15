# Agent Runtime

Read this when: editing one prepared assistant turn, provider execution, runtime
tools, or RuntimeEvent mapping.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: product policy, context selection, persistence, or
browser protocol.

## Owns

- `AgentRuntime.streamEffect(request)` and `createAgentRuntime`.
- `createBasicRuntimeAgent(runtime, defaults)` for small model-only jobs that
  reuse runtime validation without exposing tools by default.
- Assistant profile, executor, provider/model, tool, and prompt preparation for
  one prepared turn.
- AgentExecutor registry/selection and the default AI SDK tool-loop executor.
- Runtime tool protocol and normalized RuntimeEvents.
- Provider adapters and deterministic runtime test fakes.

## Does Not Own

- Product authorization, approval policy, or host-command dispatch.
- Context gathering, redaction, manifests, or database writes.
- HTTP/SSE transport.
- Widget or `sidechat.v1` browser state.

## First Files To Open

- `src/runtime/README.md`
- `src/runtime/agent-runtime.ts`
- `src/runtime/basic-agent/basic-runtime-agent.ts`
- `src/runtime/turn/prepare-runtime-turn.ts`
- `src/runtime/executors/executor-selection.ts`
- `src/runtime/ai-sdk/README.md`
- `src/tools/runtime-tool.ts`

## Verify

- `npm test --workspace @side-chat/agent-runtime`
- `npm run typecheck --workspace @side-chat/agent-runtime`
- Full gate: `npm run verify`

## Canonical Docs

- `docs/architecture/extension-seams.md`
- `docs/architecture/package-boundaries.md`
- `docs/architecture/runtime-and-protocol-events.md`
- `docs/operations/verification.md`
