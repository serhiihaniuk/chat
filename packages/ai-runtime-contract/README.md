# AI Runtime Contract

Read this when: editing the core-to-runtime boundary, runtime event contracts,
or runtime port types.
Source of truth for: provider-neutral request, event, error, stream, and port
contracts shared by product core and runtime implementations.
Not source of truth for: executable tools, provider adapters, AI SDK parts,
prompt builders, product policy, persistence, or browser protocol events.

## Owns

- `AiRuntimeRequest`, the final execution-ready request from product core to a
  runtime implementation.
- `AiRuntimePort`, the Effect-first stream port product core calls.
- Runtime events, activity details, public runtime error codes, finish reasons,
  ids, and stream type aliases.
- Tool scope data that runtime may pass to app-owned executable tools after
  policy has selected tool names.

## Does Not Own

- Runtime tool execution, tool registries, provider/model adapters, or AI SDK
  stream-part mapping.
- Assistant profile resolution, prompt rendering, context gathering, turn
  guards, host-command dispatch, or persistence.
- `sidechat.v1` browser DTOs or protocol sequence validation.

## Boundary Rules

- Keep this package provider-neutral and browser-protocol-neutral.
- Do not import OpenAI, AI SDK, Hono, React, DB, service composition, or runtime
  implementation helpers.
- `partner-ai-core` may import this package for runtime contracts, but must not
  import `@side-chat/agent-runtime`.
- `agent-runtime` implements these contracts and owns executable tools behind
  them.

## Verify

- `npm test --workspace @side-chat/ai-runtime-contract`
- `npm run typecheck --workspace @side-chat/ai-runtime-contract`
- `npm run lint:custom`
