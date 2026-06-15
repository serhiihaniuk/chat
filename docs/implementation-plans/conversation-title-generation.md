# Conversation Title Generation Architecture

Read this when: implementing or replacing automatic conversation titles after a
conversation's first successful assistant turn.
Source of truth for: the implemented ownership shape for conversation-title
generation and the checks that protect it.
Not source of truth for: canonical vocabulary, assistant turn lifecycle order,
provider adapter internals, or browser protocol contracts.

## Goal

Generate and store one short title for a newly started conversation after the
first successful user/assistant exchange.

The target state is:

```txt
[x] Core owns when title generation runs.
[x] Core owns admitted inputs, sanitization, and failure semantics.
[x] Runtime owns reusable model-only auxiliary agent construction and normalized RuntimeEvents.
[x] Service composition supplies the title prompt as configuration, plus concrete runtime, repositories, and observability.
[x] DB repositories own scoped, write-once title storage.
[x] Browser protocol, chat client, and widget only read already-stored titles.
[x] Title generation failures never change the browser stream's terminal outcome.
```

## Previous Problem

The implementation this replaced put product behavior in deployable-service
adapter code:

```txt
apps/partner-ai-service/src/inbound/http/routes/chat/chat-stream.ts
-> builds a title agent per request

apps/partner-ai-service/src/adapters/persistence/service-persistence.ts
-> calls title generation from completeAssistantTurn persistence

apps/partner-ai-service/src/adapters/title/runtime-conversation-title-agent.ts
-> owns prompt text, runtime request shaping, sanitization, fallback, and errors
```

That shape mixes unrelated responsibilities:

| Responsibility                           | Current location            | Why it is wrong                                                                                                                    |
| ---------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| "Run after first successful turn" policy | service persistence adapter | This is core stream-chat lifecycle behavior, not DB adapter behavior.                                                              |
| Hidden model prompt configuration        | service title adapter       | Prompt text may be service-owned configuration, but it should be declared by service composition, not hidden in an ad hoc adapter. |
| Hidden model admitted content            | service title adapter       | Core owns which user/assistant text crosses this product workflow boundary.                                                        |
| Auxiliary agent construction             | service title adapter       | Runtime should expose a reusable model-only agent seam instead of each feature hand-rolling one.                                   |
| Failure isolation                        | service persistence adapter | Post-success enrichment must not make assistant completion look failed.                                                            |
| Route wiring                             | chat route                  | Routes should parse, auth, and transport; they should not build lifecycle side agents.                                             |
| Generated-title fallback                 | service title adapter       | Read-model fallback and generated-title writes are different contracts.                                                            |

The service may provide prompt text, concrete adapters, and deployable config,
but it should not decide the product lifecycle or hide an extra model call
inside persistence.

## Target Ownership

| Area                        | Owns                                                                                                          | Must not own                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/partner-ai-core`  | Title-generation trigger, input selection, sanitization, write-once call, observation, and failure isolation. | Service-owned prompt text, provider SDKs, Hono routes, Drizzle records, widget state. |
| `packages/agent-runtime`    | Reusable basic auxiliary-agent constructor, model execution, and normalized RuntimeEvents.                    | Conversation title policy, persistence, browser protocol events.                      |
| `apps/partner-ai-service`   | Title prompt configuration, wiring core ports to concrete runtime, repositories, config, and observability.   | Title lifecycle timing, runtime request assembly, route-local side agents.            |
| `packages/db`               | `prepareConversationTitle` write-once storage under workspace and subject scope.                              | Core lifecycle decisions or model execution.                                          |
| `packages/chat-client`      | Reading conversation summaries from service resource routes.                                                  | Title generation or storage policy.                                                   |
| `packages/side-chat-widget` | Rendering conversation summary titles.                                                                        | Runtime, provider, DB, or title-generation details.                                   |
| `packages/chat-protocol`    | Stream and request DTOs only.                                                                                 | A title-generated event unless product explicitly adds one later.                     |

## Lifecycle

Title generation is post-success enrichment. It should happen after the
assistant answer has reached a successful terminal event and after core has the
completed user/assistant exchange.

Target flow:

```txt
runtime emits sidechat.completed
-> core validates the terminal accumulator
-> core persists assistant message, usage, and completed turn state
-> core attempts conversation title generation if this is the first untitled turn
-> core records memory write candidates
-> core records final observation
```

The exact ordering between title generation and memory write candidates can be
chosen during implementation, but both must remain post-success side effects.
Neither may create a second terminal stream outcome.

The implementation must catch and observe title failures:

```txt
[ ] Runtime failure while generating the title: observe and skip the title write.
[ ] Invalid or empty generated title: observe and skip the title write.
[ ] Repository write conflict because another request wrote first: treat as skipped or already-written.
[ ] Repository error: observe as title enrichment failure, not as stream failure.
```

Do not emit a browser protocol event for title generation in this phase. The UI
learns about the title through conversation-list reads or a later explicit
resource refresh.

## Core Design

Add a small core module:

```txt
packages/partner-ai-core/src/application/stream-chat/conversation-title/prepare-conversation-title.ts
```

Suggested responsibilities:

```txt
[ ] decide whether this turn is eligible for title generation
[ ] call the runtime auxiliary-agent seam with service-supplied prompt config
[ ] collect text output from RuntimeEvents
[ ] sanitize the generated title
[ ] call the conversation title persistence port
[ ] record safe observability for generated, skipped, and failed outcomes
```

Keep this module boring and explicit. It should read as a sequence of named
stages, not as a nested `Stream.unwrap(Effect.map(...))` expression.

Suggested local shape:

```ts
export const prepareConversationTitleAfterCompletion = (
  ports: StreamChatPorts,
  input: StreamChatInput,
  turn: PreparedStreamChatTurn,
  assistantContent: string,
): Effect.Effect<void, never>;
```

The returned Effect should not fail. It should catch expected port/runtime
failures internally, record a safe observation, and return `Effect.void`.

### Eligibility

Only attempt generation when all are true:

```txt
[ ] The completed stream has a successful `sidechat.completed` terminal event.
[ ] The conversation does not already have `titleText`.
[ ] The current exchange is the first visible user/assistant exchange for the conversation.
[ ] User content and assistant content are non-empty after trimming.
[ ] Title generation is enabled by service composition, if a config switch is added.
```

Prefer an explicit repository/core fact such as `conversation.inserted`,
`conversation.startedThisRequest`, or `userMessage.sequenceIndex` over guessing
from title absence. Old untitled conversations should not trigger title
generation on an arbitrary later turn just because they lack a stored title.

### Auxiliary Runtime Agent

Title generation should be the first consumer of a reusable runtime primitive,
not a reason to invent a title-only runtime path. Add a small constructor in
`agent-runtime` for model-only auxiliary jobs such as conversation titles,
model-backed security checks, classifiers, routing decisions, and other
internal checks that need the same provider/executor machinery without becoming
browser-visible assistant turns.

Suggested runtime API shape:

```ts
export type BasicRuntimeAgent = {
  readonly streamEffect: (input: BasicRuntimeAgentInput) => RuntimeEventStream;
};

export const createBasicRuntimeAgent = (
  runtime: AgentRuntime,
  defaults: BasicRuntimeAgentDefaults,
): BasicRuntimeAgent;
```

The exact names can change during implementation. The boundary rule is the
important part: runtime owns the reusable constructor and provider/executor
execution; core owns when an auxiliary job runs and what product data is
admitted to it; service owns deployable prompt/config defaults.

Title runtime requests must:

```txt
[ ] use the completed turn's provider/model selection unless product config adds a dedicated title model
[ ] use a suffixed request id, for example `<requestId>:conversation-title`
[ ] use a suffixed runtime assistant turn id, for example `<assistantTurnId>:conversation-title`
[ ] use title prompt text supplied by service composition
[ ] pass no runtime tools
[ ] pass no host command scope
[ ] pass no RAG, memory, host context, or previous conversation history
[ ] include only the current user message and assistant answer needed for title generation
[ ] run under a short timeout or abort policy that cannot hold the response open indefinitely
```

The suffixed assistant turn id is a runtime correlation id only. Do not persist
it as a second assistant turn.

Do not let the auxiliary-agent constructor import core, DB, protocol, Hono, or
widget code. It should only package a prepared model-only job into the existing
runtime execution path.

### Prompt Contract

Keep title prompt text in service configuration. This service is the deployable
composition surface, so it owns the default wording and any environment/profile
override. Core consumes that prompt through a typed config/port and owns the
safety envelope around it: which inputs are inserted, which context is excluded,
and how the result is sanitized.

Suggested service default:

```txt
System:
Prepare a short title for a completed Side Chat exchange.
Use both the user message and assistant response.
Return only the title: 2-6 words, no quotes, no trailing period.

User:
User message:
<trimmed first user message>

Assistant response:
<trimmed assistant answer>
```

This sample is documentation for the service-owned default, not a requirement
to hardcode the prompt in core. Core may later provide a minimal safety fallback
if configuration is absent, but this implementation phase does not need one.

Do not include host context, memory, RAG results, research artifacts, tool
payloads, raw provider metadata, or previous messages. A conversation title is
UI metadata for the conversation, not a second answer.

### Sanitization

Sanitization belongs in core because the stored title is a product record.

Rules:

```txt
[ ] take the first non-empty generated line
[ ] strip leading "title:" noise, quotes, markdown wrappers, trailing sentence punctuation, and repeated whitespace
[ ] cap to 2-6 words and a small character limit such as 64 characters
[ ] reject empty titles
[ ] reject titles that copy the full user message
[ ] reject titles containing control characters or multiline content
[ ] store only the sanitized title text
```

Do not persist raw model output, raw prompt text, provider errors, or debug
metadata in the conversation record.

### Fallback

Do not fabricate a "generated" title inside the title-generation side effect
when the hidden model call fails.

Use these separate contracts:

```txt
[ ] Generated title: sanitized model output stored once in `titleText`.
[ ] Read fallback: safe title projection used by list/history routes when `titleText` is absent.
```

Read fallback may continue to derive a display label from the first visible user
message or use `Untitled chat`, but that fallback should not be written as if it
were generated by the hidden title workflow.

## Port And File Changes

### Core

Expected changes:

```txt
packages/partner-ai-core/src/application/stream-chat/conversation-title/prepare-conversation-title.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-terminal-lifecycle.ts
packages/partner-ai-core/src/application/stream-chat/stream-chat-types.ts
packages/partner-ai-core/src/ports/lifecycle/conversation.ts
packages/partner-ai-core/src/ports/title/conversation-title-generation.ts
packages/partner-ai-core/src/services/effect-runtime.ts
packages/partner-ai-core/src/testing/stream-chat/fake-ports.test-support.ts
```

Preferred port change:

```ts
export type ConversationRepositoryPort = {
  readonly ensureConversation: (...args) => Effect.Effect<ConversationRef, unknown>;
  readonly appendUserMessage: (...args) => Effect.Effect<MessageRef, unknown>;
  readonly prepareConversationTitle: (input: {
    readonly authContext: AuthContext;
    readonly conversationId: string;
    readonly titleText: string;
    readonly now: string;
  }) => Effect.Effect<void, unknown>;
};
```

Keep `AssistantTurnLifecyclePort.completeAssistantTurn` focused on assistant
turn persistence. Do not pass a title agent into it.

Add an app-supplied title-generation config/port with an explicit name such as
`conversationTitleGeneration`. It should carry the enabled/disabled state and
service-owned prompt text into core without giving the service control over
runtime request assembly or lifecycle timing. The no-op/default path should be
visible in diagnostics if product behavior depends on it.

### Service

Expected deletions or moves:

```txt
apps/partner-ai-service/src/adapters/title/runtime-conversation-title-agent.ts
apps/partner-ai-service/src/adapters/title/runtime-conversation-title-agent.test.ts
apps/partner-ai-service/src/adapters/persistence/service-conversation-title.ts
```

Expected changes:

```txt
apps/partner-ai-service/src/adapters/persistence/service-persistence.ts
apps/partner-ai-service/src/inbound/http/routes/chat/chat-stream.ts
apps/partner-ai-service/src/composition/ports/service-ports.ts
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/config/service-conversation-title-config.ts
```

The service persistence adapter should map
`ConversationRepositoryPort.prepareConversationTitle` to
`repositories.prepareConversationTitle(...)` and nothing more.

The chat route should not import a title agent. It should receive composed ports
and build the core layer the same way for title and non-title turns.

The service composition/config path should define the title prompt text. Keep it
near other deployable service behavior, not inside persistence or route code.

### DB

Keep DB behavior narrow:

```txt
[ ] `prepareConversationTitle` updates only conversations in the authorized workspace and subject.
[ ] It writes only when `title_text` is currently null.
[ ] It leaves existing titles unchanged.
[ ] Memory and Postgres adapters share repository contract tests for write-once behavior.
```

Do not import core use cases, runtime types, protocol DTOs, Hono, or widget code
into `packages/db`.

### Runtime

Add the reusable model-only auxiliary-agent constructor in runtime:

```txt
packages/agent-runtime/src/runtime/basic-agent/basic-runtime-agent.ts
packages/agent-runtime/src/runtime/basic-agent/basic-runtime-agent.test.ts
packages/agent-runtime/src/index.ts
```

The constructor may build on the existing `AgentRuntimeRequest -> RuntimeEvent
stream` path internally. It should not expose provider-native DTOs or decide any
product policy. Title generation is one consumer; later model-backed guards,
security checks, classifiers, and routing helpers should be able to reuse the
same primitive.

The fake provider may keep deterministic title behavior for tests, but it
should key off the service-configured prompt shape. It must not become the
source of title policy.

### Client And Widget

No generation logic belongs here.

Client and widget changes should stay limited to:

```txt
[ ] conversation-list resource types include a browser-safe title string
[ ] history/list routes return stored title or safe read fallback
[ ] widget renders the title from the resource response
```

Do not add an SSE title event unless product explicitly needs live title updates.

## Tests

Add tests before moving the implementation.

Core tests:

```txt
[ ] successful first untitled turn runs one hidden runtime request after completion
[ ] hidden runtime request uses suffixed ids, selected provider/model, no tools, and no context board content
[ ] sanitized generated title is persisted through the conversation port
[ ] existing title skips hidden runtime and write
[ ] non-first turn with missing title skips hidden runtime and write
[ ] empty/noisy/copied generated title skips write
[ ] runtime title failure is observed and does not change `sidechat.completed`
[ ] title repository failure is observed and does not change `sidechat.completed`
```

Service tests:

```txt
[ ] service conversation port maps `prepareConversationTitle` with workspace and subject scope
[ ] chat route no longer imports or constructs a title agent
[ ] launched service still lists the stored generated title after the first successful turn
```

DB tests:

```txt
[ ] memory repository writes a missing title once
[ ] Postgres repository writes a missing title once
[ ] second title write does not replace the first title
[ ] list conversations returns stored title before fallback text
```

Runtime tests:

```txt
[ ] `createBasicRuntimeAgent` runs a model-only prepared job through the existing runtime path
[ ] basic runtime agents can disable tools by default
[ ] basic runtime agents do not import core, DB, protocol, Hono, or widget code
[ ] fake provider still returns deterministic title output for the service-configured prompt, if used by app-path tests
[ ] runtime has no knowledge of conversation title persistence or browser protocol
```

Widget/client tests:

```txt
[ ] client parses conversation summaries with titles
[ ] widget renders conversation titles from summaries
[ ] widget has no runtime, provider, Effect, DB, or service imports
```

## Documentation Updates For The Implementation Patch

When the code move lands, update the docs in the same patch:

```txt
[ ] docs/domain/vocabulary.md: add "Conversation title" if the term becomes stable.
[ ] docs/architecture/assistant-turn.md: stage 13 should name core-owned post-success enrichment.
[ ] docs/architecture/package-boundaries.md: keep title generation under core lifecycle, runtime execution, and DB storage.
[ ] docs/architecture/extension-seams.md: add a short post-turn enrichment seam only if configuration is exposed.
[ ] apps/partner-ai-service/README.md: say service composition owns title prompt configuration, not lifecycle timing.
[ ] packages/partner-ai-core/src/application/stream-chat/README.md: list the title module.
```

## Verification

Run narrow checks first:

```sh
npm test --workspace @side-chat/partner-ai-core
npm test --workspace @side-chat/partner-ai-service
npm test --workspace @side-chat/db
```

Then run the repo gates that match the change:

```sh
npm run lint:oxlint
npm run typecheck
npm test
npm run lint:custom
```

Before claiming the implementation is complete, run:

```sh
npm run verify
```

If the local shell is not on the supported Node/npm versions, use the pinned
runtime command from `docs/operations/verification.md`.

## Definition Of Done

```txt
[ ] Title prompt text lives in service composition/config, not in route, persistence, or title-agent adapter code.
[ ] No title sanitizer, runtime request builder, or generated-title fallback lives in `apps/partner-ai-service`.
[ ] `AssistantTurnLifecyclePort.completeAssistantTurn` does not know about title agents.
[ ] The chat route does not construct title-generation dependencies.
[ ] Core invokes title generation only after a successful first turn and catches all title-side-effect failures.
[ ] Runtime exposes a reusable model-only auxiliary-agent constructor used by title generation.
[ ] DB stores title text write-once under scoped repository commands.
[ ] Client/widget only consume stored or safely projected titles.
[ ] Tests prove hidden title generation cannot change the terminal stream outcome.
[ ] Docs reflect the final package ownership.
```
