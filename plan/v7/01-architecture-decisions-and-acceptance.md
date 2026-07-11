# Step 01: Architecture Decisions and Acceptance Contract

Read this when: establishing or reviewing the rewrite architecture.

Source of truth for: AI SDK 7 adoption, product-owned boundaries, feature cuts, and acceptance rules.

Not source of truth for: runtime behavior; permanent tests and later feature steps own executable proof.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: none. Unblocks: Step 02.

## Outcome

The repository records one unambiguous target:

- AI SDK 7 is the application core for agent loops, UI messages, streaming, tools, approvals, timeouts, telemetry, and provider abstraction.
- `WorkflowAgent` on the Workflow DevKit with `@workflow/world-postgres` owns durable turn execution (ADR 0016, revised; adopted with the pinned realm patch).
- Hono owns HTTP serving, routed through the Nitro workflow build.
- Side Chat owns authentication, tenancy, policy, privacy, persistence, widget behavior, and host-page integration.
- The new wing uses plain TypeScript composition and does not import the old Effect application.
- No custom execution engine, protocol shadow, or compatibility bridge is introduced.

The ignored `.reference/ai-sdk-v7` and `.reference/workflow` repositories exist so agents can inspect upstream implementation and ecosystem behavior. A reference checkout is evidence, not an adoption decision.

## Architectural decisions

1. **AI SDK 7 as core runtime and wire protocol.** Use SDK-native concepts by default, strict SDK naming, UI message stream v1 plus the Side Chat profile, exact pins, and a greenfield cutover.
2. **Durable execution.** Use `WorkflowAgent` + Workflow DevKit + Postgres World with explicit timeouts, step limits, retry ownership (`maxRetries: 0` inside steps), and signal-based cancellation via a durable abort hook. Runs survive process loss, are continuable by any instance, and replay their streams to reconnecting clients (ADR 0016; adopted 2026-07-11 with the pinned realm patch and its tripwire-guarded removal criterion).
3. **Supersede the custom product protocol.** Preserve only Side Chat-owned safe errors, privacy scrubbing, and justified `data-*` parts. Delete the custom event union, SSE codecs, envelope validators, and double mapping at cutover.
4. **Narrow the runtime port.** AI SDK UI types become the shared server/widget language. Provider construction stays server-only. Replaceable engine becomes replaceable provider.
5. **Supersede host commands with client tools.** Retain ownership binding, timeout policy, auditability, and exactly-once browser dispatch where the SDK does not own them.
6. **Plain TypeScript boundary.** The new wing is Effect-free. `plan/effect` remains unchanged historical research.

The Workflow DevKit runtime (WorkflowAgent, Postgres World, hooks, the Nitro compiler host) is adopted per the revised ADR 0016 — a user decision made 2026-07-11 after the compatibility gate ran twice. Reference checkouts remain evidence, not extra adoption license: introducing further upstream subsystems still requires a separate, user-approved decision tied to a concrete product need.

## Product decisions

1. **Approval-gated tools:** enumerate always-gated, per-input-gated, and ungated tools. New mutating tools default to gated until explicitly cleared.
2. **Approval authority and audit:** the authenticated conversation owner decides initially. Record approver, tenant, conversation, turn, tool, input digest, decision, reason, timestamps, and expiry; never duplicate raw tool input into the audit row.
3. **No-connected-client policy:** a client-tool wait suspends on its durable hook bounded by the configured timeout (the run is durable; the tool part replays to a reattaching tab), then resolves to a typed timed-out result. Do not rebuild a polling relay; the hook is the native suspension primitive.
4. **`data-*` inventory:** native parts own text, reasoning, tool lifecycle, approvals, sources, files, abort, and finish. Add a Side Chat part only when a named consumer cannot derive the concept from native parts.
5. **Feature cut list:** the canonical inventory is [ADR 0015's feature-disposition table](../../docs/adr/0015-native-ui-stream-tools-and-approval-profile.md#feature-disposition). Every old activity, recovery, and turn-completion feature is explicitly kept, redesigned, or deleted there with its user-visible consequence. Step 08 adds any disposition discovered by executable parity work to that same table instead of creating a second list.
6. **Error vocabulary:** start from `packages/chat-protocol/src/sidechat-v1/errors.ts`, remove transport-only codes, and define retryability and safe public messages.

## Acceptance contract

The architecture is accepted when:

1. the plain TypeScript/Hono service builds and boots in the monorepo through the Nitro workflow build;
2. a credential-free WorkflowAgent turn produces a native UI message stream;
3. signal-based cancellation reaches the provider promptly and accepts no later content;
4. a crashed run recovers to a durable terminal without a new user request, and product persistence never claims more durability than the engine proves;
5. governance prevents provider, Effect, browser, and configuration boundary violations;
6. no old custom runtime or protocol bridge survives cutover.

## Verification

```powershell
npm run lint:custom
npm run test:service:compatibility
```

## Completion checklist

- [x] AI SDK 7 core and Workflow durable execution recorded without ambiguity.
- [x] Product-owned boundaries and feature cuts recorded.
- [x] Reference repositories explicitly classified as non-adoption evidence.
- [x] Step 02 acceptance criteria linked to permanent tests.
- [x] `plan/effect` remains untouched.

## Handoff record

ADRs: `docs/adr/0014-ai-sdk-7-native-core.md`, `0015-native-ui-stream-tools-and-approval-profile.md`, and `0016-workflow-durable-execution-substrate.md` (revised 2026-07-11 to the adopted-with-patch outcome).

Baseline custom parts: none. Baseline execution: durable WorkflowAgent runs on the Workflow DevKit. Baseline service host: Hono through the Nitro workflow build.
