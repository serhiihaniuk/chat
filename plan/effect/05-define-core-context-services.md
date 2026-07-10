# Step 05: Define Core Context Services and Rebuild the Workflow

Read this when: removing `StreamChatPorts`, defining product services, or making workflow requirements explicit.

Source of truth for: the core service-tag layout and migration from plain dependency registries to Effect environment requirements.

Not source of truth for: Live Layer construction, which belongs to Step 08.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 04

Unblocks: Step 06 and Steps 07-16

## Outcome

Every final core workflow declares the smallest honest set of Effect services it needs. The new core modules are written ground-up and tested with focused services. No mega service, optional lookup, manual object threading, or old-to-new adapter replaces the registry. Step 08 cuts the running application directly to this final path and deletes `StreamChatPorts` plus the old workflow modules atomically.

## Target service design

Commit to this initial service inventory, adjusted only when current code proves two capabilities share or do not share an ownership/recovery invariant:

- `ConversationStore`;
- `TurnPreparationStore`;
- `AssistantTurnStore`;
- `TurnLeaseStore`;
- `TurnEventLog`;
- `HostCapabilityManifest`;
- `TurnPolicyResolver`;
- `RequestPolicyEvaluator`;
- `TurnGuardRegistry`;
- `TurnContextPreparer`;
- `AiRuntime`;
- `ModelOnlyInvoker`;
- `IdGenerator`;
- `ProductTelemetry`;
- `TurnActivityHistoryPolicy`;
- `ConversationTitlePolicy`;
- `TurnLeasePolicy`.

One repository/client Layer may implement several tags. That does not justify merging their contracts. Keep authority validation, `prepareStreamChatTurn`, `runTurnGeneration`, protocol mapping/accumulation, terminalization, and title orchestration as ordinary workflow functions, not services.

Use actual inventory to refine operations. `AssistantTurnStore` and `TurnLeaseStore` remain separate because finalization/control and lease fencing have different retry/error semantics. Decide explicitly whether active-turn lookup belongs to admission or assistant-turn storage.

Request/domain values remain function inputs: `AuthContext`, workspace/host references, request data, prepared turn data, and correlation. Only external or replaceable capabilities become services. Authority proof stays pure domain logic; `RequestPolicyEvaluator` is the external policy capability.

Service operations normally return `Effect<A, E, never>` because their Live Layer closes over implementation dependencies. A method-level environment is an exceptional reviewed higher-order capability. Use stable package-qualified service identifiers to prevent collisions.

Effect's built-in Clock replaces `ClockPort` in Step 07. Do not define a new clock service here.

## Function-shape rules

Transform operations from shapes like:

```ts
operation(ports, input): Effect<Output, Error>
```

to a service-requiring Effect such as:

```ts
operation(input): Effect<Output, Error, NeededServiceA | NeededServiceB>
```

The exact generic order and service APIs must match the selected Effect v4 declarations. Named internal stages can require narrower environments than the exported orchestration function.

Do not immediately call every service at the top of the workflow and rebuild a local `ports` object. That preserves the old hidden registry. Acquire a service at the stage that owns its operation, or define a named Effect function whose requirements remain visible.

## Implementation sequence

1. Generate a dependency matrix for every stream-chat operation: function, currently used port fields, target service tags, error tags, and test substitutions.
2. Establish package-local naming and export rules for service tags. Avoid a central `services.ts` dumping ground if cohesive folders already exist.
3. Convert leaf operations first: event mapping/persistence, lease helpers, title preparation, context/policy stages, and finalization helpers.
4. Convert mid-level preparation, generation drain, and terminal lifecycle functions. Let their `R` types accumulate naturally.
5. Build final exported stream-chat entry points for the Context-service path. Keep Layer provision out of core; Step 08's composition/runtime root owns it. Do not wrap these entry points in a `StreamChatPorts` compatibility adapter.
6. Replace optional `observability?: ...` and similar behavior with required services plus explicit no-op Layers. Use `Context.Reference` only if the decision is documented in `KNOWLEDGE.md` with proof that absence cannot hide invalid composition.
7. Build focused service Test Layers beside the final contracts using Step 03's neutral primitives. Delete large fixture builders that populate unused fields.
8. Isolate the old active workflow without modifying it into a bridge. Record its complete deletion inventory for Step 08, where route/runner cutover and deletion happen together.
9. Add compile fixtures or permitted `@ts-expect-error` type tests proving an Effect with a required service cannot be run as `Effect<_, _, never>` without provision. Runtime tests prove substitution, not Context internals.
10. Supersede ADR 0003 and update `docs/architecture/effect.md` in this step when Context-service core becomes implemented truth. Preserve the historical containment rationale and state that Layers remain server/core-only.

## Specific current anchors

Reinspect these and their callers:

- `packages/partner-ai-core/src/application/stream-chat/stream-chat-types.ts`
- `packages/partner-ai-core/src/application/stream-chat/stream-chat.ts`
- `packages/partner-ai-core/src/application/stream-chat/protocol/**`
- `packages/partner-ai-core/src/application/stream-chat/conversation-title/**`
- core port exports under `packages/partner-ai-core/src/ports/**`
- `apps/partner-ai-service/src/composition/ports/create-stream-chat-ports.ts`
- `apps/partner-ai-service/src/composition/bundle-types.ts`
- routes and turn-runner modules that accept `StreamChatPorts`

Paths are search anchors; use current package exports and do not add cross-source relative imports.

## Contract tests

- the Step 02 stream-chat conformance suite passes against service Layers;
- a leaf operation can run with only its declared services;
- omitting a required service fails at compile/provision time rather than selecting an implicit undefined fallback;
- no-op telemetry is explicit and does not change workflow behavior;
- two independent service implementations satisfy the same workflow contract;
- terminal, sequence, lease, title, and cancellation behavior remains unchanged.

Add type tests that prevent core APIs from accepting a `StreamChatPorts`-like registry if helpful. Do not test Effect Context internals.

## Readability constraints

- Keep one lifecycle stage per named Effect function.
- Use `Effect.fn` only after Step 14 establishes tracing conventions; ordinary named functions are sufficient now.
- Avoid long generator bodies that retrieve many services and mix policy, persistence, runtime drain, and protocol mapping.
- Add a file-level mental model to concept-dense orchestration modules after their final shape is known.

## Verification

```powershell
rg -n 'StreamChatPorts|createStreamChatPorts|ClockPort|observability\?' packages/partner-ai-core apps/partner-ai-service
npm test -- packages/partner-ai-core
npm test -- apps/partner-ai-service/src/composition
npm run typecheck
npm run lint:oxlint
npm run lint:custom
```

Document any remaining search matches and the step that owns them. Core-path matches must be zero before completion.

## Completion checklist

- [ ] A dependency matrix exists for all core stream-chat operations.
- [ ] The committed service inventory is implemented or every deviation has invariant-based rationale.
- [ ] Cohesive services are defined near their owners; no mega service exists.
- [ ] Core functions expose honest, narrow `R` requirements.
- [ ] Required behavior is provided explicitly; optional lookup does not mask wiring errors.
- [ ] Focused service Layers replace large port fixtures in tests.
- [ ] ADR 0003 and the canonical Effect architecture doc describe the implemented Context-service direction.
- [ ] No final core module accepts or constructs `StreamChatPorts`; no compatibility adapter exists.
- [ ] The remaining old active path is isolated, unchanged except for compile-safe coexistence, and has a complete Step 08 deletion inventory.
- [ ] Core conformance, service composition tests, typecheck, and governance pass.
- [ ] `STATUS.md` records the final service inventory and deletion search.

## Handoff record

Service inventory and locations: pending

Any approved `Context.Reference`: none expected

Remaining isolated legacy matches for Step 08 deletion: pending

Verification: pending
