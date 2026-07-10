# Step 04: Establish the Tagged Error and Failure Policy

Read this when: replacing broad, unknown, stringly, or prematurely flattened failures with owned typed errors.

Source of truth for: the rewrite's error ownership, recovery categories, mapping points, and defect policy.

Not source of truth for: public protocol error changes. Preserve `sidechat.v1` unless this step explicitly proves and coordinates a contract change.

Status: `not_started`

Owner: unassigned

Depends on: Step 03

Unblocks: Steps 05-16

## Outcome

Core, runtime, and service operations expose tagged failures that communicate ownership, retryability, and safe boundary mapping. Expected failures remain in the typed error channel until their owning boundary. Defects and interruption remain distinguishable. Raw causes and private data never cross HTTP, protocol, log, or telemetry boundaries.

## Current problems to verify

- Owned port methods use `unknown` or flatten errors before the workflow can recover by tag.
- `mapPortFailure`-style catch-all mapping loses operation and retry information.
- `AiRuntimeError` does not fully encode stable operation, retryability, safe message, and private cause.
- HTTP and streaming paths map related failures in more than one place.
- background fibers use cause-level catches that can hide defects or permanent source failures.

Search current code rather than assuming every problem remains.

## Error taxonomy

Define the final union from current operations. Errors visible in a core service contract live beside that contract in `partner-ai-core`; service adapters translate DB/SDK failures into them. Adapter-only acquisition/reconnect errors stay in `partner-ai-service`. Runtime errors live in the runtime contract/`agent-runtime`. HTTP owns no lower-level failures and only maps the unions.

Begin with these ownership groups and merge only when recovery and boundary mapping are genuinely identical:

- request and policy: `AuthorizationError`, `InvalidTurnRequestError`, `ConversationBusyError`, `PolicyDeniedError`, `PolicyEvaluationError`, `TurnGuardRejectedError`, `TurnGuardExecutionError`, `CapabilityManifestError`, `TurnPolicyResolutionError`;
- core dependencies: `ContextPreparationError`, `ConversationStoreError`, `AssistantTurnStoreError`, `TurnEventLogError`, `TitleGenerationError`;
- runtime: provider/executor selection, provider execution, `InvalidRuntimeSequenceError`, and tool execution;
- service boot/lifecycle: `ServiceConfigError`, `PersistenceInitializationError`, `NotificationSourceError`, `HostCommandAwaitError`, `TurnCapacityError`.

Names are proposals, not an excuse to create one class per function. A tag needs a distinct caller action, retry decision, public mapping, or owner.

## Error shape rules

Each owned operational error should provide only what its callers need:

- stable `_tag`;
- stable operation/code where the tag spans multiple operations;
- `retryable` only when the owner can classify it safely;
- safe public message or safe mapping key;
- internal `cause` retained without serialization/logging by default;
- identifiers only when needed for control flow and safe under repository privacy rules.

Use the selected version's verified schema-backed tagged error API where boundary encoding benefits. Plain tagged classes/data are acceptable for internal-only errors. Do not use TypeScript assertions to manufacture tags.

## Implementation sequence

1. Inventory every `Effect<_, E, _>` in core/runtime/service plus Promise adapters that create an Effect error. Produce a table of current error, owner, recovery, boundary mapping, and target tag.
2. Define errors in the package whose contract exposes them, following the dependency-direction rule above. Do not create a global error package or let HTTP/service adapters force core to depend outward.
3. Convert provider/runtime failures first so downstream workflows receive actionable tags. Keep provider-specific raw errors private to `agent-runtime`.
4. Define the persistence/context contract failures needed by Step 05. Step 06 centralizes Promise wrapping and translates repository/driver failures into those final contract errors.
5. Replace early catch-all mapping in stream-chat with tag-preserving composition. Handle expected alternatives with `catchTags` or explicit matching at the stage that can recover. Keep title-generation failure locally isolated after successful turn finalization so it does not widen the main turn terminal algebra.
6. Establish one exhaustive pre-stream mapper from the internal tagged union to safe HTTP/protocol response.
7. Establish one post-stream mapper that emits exactly one safe terminal protocol event and persists the terminal state. Do not attempt to change HTTP status after SSE begins.
8. Define cause policy for background services: expected recoverable tags follow schedule/degrade policy; interruption closes cleanly; defects and unclassified causes are reported and fail the owner rather than becoming success.
9. Add compile-time exhaustiveness tests or `satisfies`-based tables for boundary mappings. A new error tag must fail compilation until mapped.
10. Delete obsolete wrappers, message parsers, aliases, and generic error types in the converted scope.

## Contract tests

For each tag, test the observable mapping and absence of sensitive data. Required cross-cutting tests:

- a transient repository cause is typed and can be selected for retry without exposing the driver message;
- an authorization/policy error maps before stream start to the established public contract;
- a provider failure after streaming starts produces one terminal event and no HTTP remap;
- interruption is not reported as an operational failure;
- a defect is visible to the owner/supervisor and is not converted to a normal domain error;
- raw provider, database, tool payload, prompt, and secret sentinel strings do not appear in responses or recorded telemetry;
- every error tag has an exhaustive mapping.

## Likely affected areas

- `packages/agent-runtime/src/runtime/**`
- `packages/partner-ai-core/src/application/stream-chat/**`
- core port definitions under `packages/partner-ai-core/src/ports/**`
- `apps/partner-ai-service/src/config/service-config-error.ts`
- persistence/context/runtime adapters
- `apps/partner-ai-service/src/inbound/http/response/protocol-errors.ts`
- SSE terminalization and background service error handlers

Keep error modules near their owner. Add a small package-level index only when consumers need a stable export.

## Verification

```powershell
rg -n 'Effect<[^>]*unknown|mapPortFailure|catchCause|catchAll|new Error\(' packages/partner-ai-core packages/agent-runtime apps/partner-ai-service
npm test -- <error-and-boundary-contract-files>
npm run typecheck
npm run lint:oxlint
npm run lint:custom
```

The search is a review aid, not a rule that every `unknown` or cause-level catch is invalid. Document legitimate remaining occurrences.

## Completion checklist

- [ ] An inventory maps each owned failure to owner, recovery, and boundary.
- [ ] Owned port/runtime/service operations no longer expose unclassified `unknown` errors.
- [ ] `AiRuntimeError` or its replacement encodes operation, retryability, safe mapping, and private cause.
- [ ] Pre-stream and post-stream mappings are single, exhaustive, and tested.
- [ ] Expected errors, interruption, and defects remain distinguishable.
- [ ] Sensitive sentinel tests pass.
- [ ] Obsolete generic wrappers are deleted.
- [ ] Targeted tests, typecheck, and lint gates pass.
- [ ] `STATUS.md` records the error matrix and verification.

## Handoff record

Final tag inventory: pending

Legitimate remaining `unknown`/cause catches: pending

Protocol changes, if any: none expected

Verification: pending
