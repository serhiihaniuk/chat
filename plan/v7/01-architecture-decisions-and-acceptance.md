# Step 01: Architecture Decisions and Acceptance Contract

Read this when: establishing the rewrite's architecture before any new-wing code is written.

Source of truth for: the AI SDK 7 core decision, the preferred execution substrate, the fallback boundary, the ADR set, product-policy inventories, and the compatibility criteria that Step 02b must prove.

Not source of truth for: runtime behavior. Step 02b owns executable proof; later feature steps own their implementations.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: none. Unblocks: Step 02a.

## Outcome

The repository records its target architecture before implementation starts:

- AI SDK 7 is the product core, unconditionally.
- `WorkflowAgent` + Workflow DevKit + Postgres World is the default durable execution substrate.
- The fallback, if the self-hosted substrate fails a load-bearing compatibility invariant, is AI SDK 7 `ToolLoopAgent` with request-bound single-instance execution. It is not the current custom runtime, an Effect rewrite, or a custom durability framework.
- The execution-substrate choice is decided by permanent tests against retained foundation code, not by a disposable spike.
- Approval policy, custom stream parts, error vocabulary, and deliberate feature cuts are decided before feature implementation.

## Architectural decisions

Write or supersede the relevant ADRs with their current content in view:

1. **AI SDK 7 as core runtime and wire protocol.** Record SDK-native-by-default, strict SDK naming, plain-TypeScript composition, UI message stream `v1` plus the Side Chat profile, exact version pins, and greenfield cutover.
2. **Supersede the custom product protocol.** Preserve only Side Chat-owned error codes, privacy scrubbing, and justified `data-*` parts. Delete the custom event union, SSE codecs, envelope validators, and double mapping at cutover.
3. **Preferred durable substrate and explicit fallback.** Adopt WorkflowAgent/Postgres World by default. Record the permanent acceptance contract in this file and the fallback's intentionally reduced guarantees. Step 02b later appends the measured verdict; it does not reopen AI SDK 7 adoption.
4. **Narrow the runtime port.** AI SDK UI types become the shared server/widget language. Provider construction stays server-only. “Replaceable engine” becomes “replaceable provider,” an accepted coupling.
5. **Supersede the host-command architecture.** Reframe page capabilities as client tools. Side Chat retains ownership binding, timeout policy, auditability, and exactly-once settlement.
6. **Effect boundary.** The new wing is Effect-free. Do not edit `plan/effect`; record that the v7 program supersedes its runtime jurisdiction if cutover completes.

Review at minimum ADRs 0003–0009, their index, [`KNOWLEDGE.md`](./KNOWLEDGE.md), and the current architecture docs before writing. No ADR may describe a hoped-for SDK behavior as confirmed; link the claim to either source evidence or a named permanent test in Step 02b.

## Product decisions recorded here

1. **Approval-gated tools:** enumerate always-gated, per-input-gated, and ungated tools. New mutating tools default to gated until explicitly cleared.
2. **Approval authority and audit:** authenticated conversation owner initially; record approver, tenant, conversation, turn, tool, input digest, decision, reason, request/decision timestamps, and expiry. Never store raw tool input in the audit row.
3. **No-connected-client policy:** durable execution waits for reattachment up to the configured timeout; fallback execution returns a typed no-client result. No hidden polling relay is rebuilt.
4. **`data-*` inventory:** native parts own text, reasoning, tool lifecycle, approval, sources, files, abort, and finish. Add a Side Chat part only when a named consumer cannot derive the concept from native parts.
5. **Feature cut list:** every old activity/recovery feature without a native equivalent is explicitly kept, redesigned, or deleted with the user-visible consequence.
6. **Error vocabulary:** start from `packages/chat-protocol/src/sidechat-v1/errors.ts`, remove transport-only codes that no longer exist, and define retryability and safe public messages.

## Execution-substrate acceptance contract

Step 02b selects the execution substrate. Only failures that invalidate the durable substrate's reason for existing may select fallback:

1. the pinned Workflow/Nitro service cannot build, boot, and process a turn reliably in this monorepo;
2. a run cannot recover to terminal after a hard owner-process crash without a new user request;
3. a second service instance cannot continue or serve a run created by the first through shared Postgres state;
4. replay plus live tail cannot produce a coherent client stream after reconnect;
5. user cancellation cannot both stop provider work promptly and persist a coherent terminal outcome using a supported cross-process abort design.

The following are implementation or operational findings, not fallback triggers by themselves:

- `needsApproval` is incomplete in the pinned WorkflowAgent integration path;
- deployment version skew requires drain/deploy discipline;
- workflow journal write volume needs tuning, coalescing, archiving, or pruning;
- inspection or telemetry tooling is immature;
- a feature needs a Side Chat policy layer around native primitives.

Those findings must be owned by their feature/operations step. They do not justify rebuilding a custom execution engine.

## Verification

```powershell
npm run lint:custom
rg -n "spike|throwaway" plan/v7
```

The search may find historical explanation in `KNOWLEDGE.md`; it must not find an executable disposable-spike instruction.

## Completion checklist

- [x] ADRs written or superseded; documentation index updated.
- [x] AI SDK 7 core, preferred Workflow substrate, and narrow fallback recorded without ambiguity.
- [x] Product decisions and cut list recorded.
- [x] Step 02b acceptance criteria linked from the ADR.
- [x] No product code changed by this step; `plan/effect` untouched by this step; docs governance passes.

## Handoff record

ADRs written: `docs/adr/0014-ai-sdk-7-native-core.md`, `0015-native-ui-stream-tools-and-approval-profile.md`, and `0016-workflow-durable-execution-substrate.md`. They supersede ADRs 0003–0009 at cutover without rewriting immutable history.

Approval and client-tool policies: `mock_web_search` and unchanged read-only lookup tools are ungated; mutating tools are always gated; mixed tools use per-input policy. The conversation owner approves, audit stores an input digest, durable approval expires after 24h, and Workflow uses a hook execution barrier until compiled-path conformance proves `needsApproval` safe.

`data-*`, error, and feature-cut inventories: no custom `data-*` parts at baseline; 13 safe public error codes retained; old connection-bound transport codes, dense sequencing, synthetic progress rows, custom host-command vocabulary, markers, and recovery ladder are cut. Native text/reasoning/tool timeline and the component library remain.

Acceptance-contract deviations: none. ADR 0016 records all five Step 02b invariants and distinguishes non-gating operational findings.
