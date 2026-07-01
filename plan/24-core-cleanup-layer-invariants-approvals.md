# 24 — Core cleanup: dead Layer machinery, port invariants, approval honesty, error codes

**Epic:** 4 Seams | **Priority:** P1 | **Depends on:** — | **Status:** todo

## Problem

1. **The documented composition mechanism is dead code.** `packages/partner-ai-core/src/services/effect-runtime.ts` (178 lines): 13 `Context.Service` classes, `createPartnerAiCoreLayer`, `partnerAiCoreServicesEffect` — consumed only by its own test and docs. The real service passes a plain `StreamChatPorts` object (`turn-runner.ts:87`). Yet core's `README.md:13` lists the Layer as one of two things the package *owns*, and `stream-chat-types.ts:44` claims composition binds via an Effect Layer. Adopters will study and wire the one path nothing exercises — the largest pointless Effect surface in the repo.
2. **Correctness-critical adapter invariants are folklore.** The exactly-one-terminal and idempotency guarantees depend on behaviors the ports never state: `startAssistantTurn` must be get-or-create on `(workspace_id, request_id)` (`src/ports/lifecycle/assistant-turn.ts:29` silent); `failAssistantTurn`/`completeAssistantTurn` must be first-transition-wins (`:62` silent, though `finalize-turn-generation.ts:129-132` leans on it); `appendUserMessage` must be idempotent on message id (`ports/lifecycle/conversation.ts:26` silent). Custom persistence is an advertised seam; its contract is undocumented. (`appendEvent`'s port doc is the model to follow.)
3. **Approvals validate but never enforce.** `createTurnPolicyDecision` hardcodes `allowedCommandNames = []` (`domain/capabilities/validation/validation.ts:104`); nothing consumes `approvalRequirements` for gating; ~300 lines of approval validation only cross-check the manifest. An adopter setting `approvalMode: "always"` gets nothing, silently. No approval UI exists in the widget either.
4. **One error code hides five failures:** manifest validation, policy resolution, missing guard, guard-adapter failure, and context failure all become `RUNTIME_FAILED`+`INTERNAL_ERROR`, with structured issues flattened to a space-joined string (`turn/turn-policy-plan.ts:126-144`, `errors/effect-failures.ts:15-51`). A typo'd tool name in config is indistinguishable from a provider crash.
5. Dead authority surface: `assertRequiredScope`, `AuthorityScope`, `AuthContext.roles` unused outside their test (`domain/authority.ts:25-32,51-52,118`); `ConversationHistoryContextPort` exported by core, consumed only by the service's own context manager.

## Decided approach

1. **Delete** `effect-runtime.ts` + its test; fix `README.md` and `stream-chat-types.ts:44` to describe the plain-ports composition (which is the better story for non-Effect adopters). Final-state rule: no deprecation alias.
2. Write the invariants into the three port doc comments (get-or-create semantics, first-transition-wins, idempotent append), each pointing at the `sidechatRepositoryContract` test kit as the executable spec.
3. **Approval honesty:** fail composition with a clear error when any manifest capability requests `approvalMode !== "none"` ("approval enforcement is not implemented; see <issue/story>") — a loud wall beats a silent no-op. Keep the validation code (it's the future seam); mark `APPROVAL_MODES`/`ApprovalPolicy` with a "validated, not yet enforced" doc comment.
4. Add `CONFIGURATION_INVALID` (and map capability/manifest/policy-resolution failures to it) preserving issue codes+paths in the error detail; guards keep fail-closed semantics but get a distinct code from provider failures.
5. Trim the dead authority surface (delete `assertRequiredScope`/`AuthorityScope`/roles or wire them — decision: delete; story 20's verifier owns identity) and stop exporting `ConversationHistoryContextPort` from core's public index if only the service consumes it.
6. Also delete `StreamChatInput.abortSignal` (deliberately never set in production; the title request threads it anyway — remove from both, per the runner's own design comment `turn-runner.ts:144-158`).

## Acceptance criteria

- [ ] `effect-runtime.ts` gone; core README describes plain-ports composition; `npm run verify` green.
- [ ] Port docs state the three invariants and link the contract kit.
- [ ] A config requesting `approvalMode: "always"` fails boot with a clear message (test).
- [ ] A typo'd tool name surfaces as `configuration_invalid` with the issue path, not `internal_error` (test).
- [ ] Dead authority exports removed; no production references break (grep-verified).

## Verification

```sh
npm test --workspace @side-chat/partner-ai-core
npm test --workspace @side-chat/partner-ai-service
npm run verify
```
