# Partner AI Core

Read this when: editing product stream-chat workflow, policy, context
preparation, protocol mapping, or core ports.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: HTTP adapters, database implementation, provider
execution, or widget UI.

## Owns

- `streamChatEffect(input)` and `createPartnerAiCoreLayer(...)`.
- Product authorization, policy, context, turn lifecycle, and protocol mapping.
- Post-success conversation title generation timing, admitted inputs,
  sanitization, persistence call, and failure isolation.
- Turn guard selection, context manager, and runtime port contracts.
- Typed product failures and terminal protocol semantics.
- Effect Layer wiring for core services.

## Does Not Own

- Hono routes or HTTP response writing.
- Drizzle/Postgres implementation.
- Provider SDKs or AI SDK stream parts.
- Widget message/activity rendering.
- Concrete app tools or service adapters.

## Boundary Rules

- `chat-protocol` imports are limited to browser request/message/error/usage
  DTOs and the stream-chat protocol mapper.
- Runtime request, event, and stream contracts come from
  `@side-chat/ai-runtime-contract` through the runtime port.
- Core prepares final runtime messages before calling the runtime; profiles,
  system instructions, and context manifests do not cross that boundary as
  separate runtime request fields.
- Neutral JSON primitives come from `shared`, not from `chat-protocol`.

## First Files To Open

- `src/application/stream-chat/README.md`
- `src/application/stream-chat/stream-chat.ts`
- `src/application/stream-chat/turn/prepare-stream-chat-turn.ts`
- `src/application/stream-chat/turn/turn-policy-plan.ts`
- `src/application/stream-chat/protocol/protocol-event-stream.ts`
- `src/application/stream-chat/conversation-title/prepare-conversation-title.ts`
- `src/ports/`

## Verify

- `npm test --workspace @side-chat/partner-ai-core`
- `npm run typecheck --workspace @side-chat/partner-ai-core`
- Full gate: `npm run verify`

## Canonical Docs

- `docs/architecture/assistant-turn.md`
- `docs/architecture/extension-seams.md`
- `docs/architecture/package-boundaries.md`
- `docs/architecture/runtime-and-protocol-events.md`
