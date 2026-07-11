# Step 08: Turn Completion — Title, Remaining Edge Cases, Parity Audit

Read this when: finishing the turn feature set and auditing it against the old app.

Source of truth for: title generation, the residual edge cases, and the behavior-parity checklist execution.

Not source of truth for: core turn flow (Step 05) or the scrub rules (Step 06).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 05, 06. Unblocks: Step 13 (widget can rely on complete turn semantics).

## Outcome

The turn feature is complete and audited: titles generate without ever blocking a turn, the residual edge cases are tested, and every intentional behavior difference from the old app is recorded rather than silently shipped.

## Old-app reference

- Title isolation: `packages/partner-ai-core/src/application/stream-chat/conversation-title/**` — title failure never blocks/fails turn finalization; runs once per conversation on first completion (verify the exact trigger rule and keep it).
- The parity source: the old app running with its fake config is the executable reference.

## Target design

### Title generation

A side call with `Output.object({ schema })` on the configured cheap model instance, `timeout: settings.timeouts.titleMs`, triggered after the first completed turn. Start a separate idempotent `generateConversationTitle` workflow after terminal persistence. The update is conditional on the title still being empty, so replay and races cannot retitle. Failure logs safely and never touches turn status.

### Residual edge cases (each a test)

1. empty model response (finish, no text) → completed terminal; persist one assistant `UIMessage` with stable id and `parts: []`;
2. step-limit reached (`stopWhen`) → length semantics through the Step 06 mapping; turn completes;
3. the configured turn timeout expires → aborted-with-timeout terminal (verify the abort-path error naming keeps the engine from retrying the step — Step 02 engine finding);
4. title model failure/timeout → turn unaffected, safe log, no title;
5. title success → conversation title persisted once; a second turn does not retitle (per the verified rule);
6. reasoning-only response (reasoning parts, minimal text) → streams and persists correctly.

### Parity audit

Execute the checklist against both apps with equivalent scripted providers where practical; record every delta in the handoff and, where user-visible, in the Step 01 cut list:

streamed text + reasoning; exactly one terminal; durable cancel and reconnect semantics; pre-stream vs mid-stream provider failure; content filter → blocked; step limit → length; usage per turn; abort → calm cancelled; title behavior; no provider DTO or raw error on the wire. Expected deltas are recorded explicitly.

## Verification

```powershell
npm test -- apps/side-chat-service
npm run typecheck
npm run lint:custom
```

## Completion checklist

- [ ] Title generation isolated, tested, trigger rule preserved.
- [ ] All six residual edge cases tested.
- [ ] Parity checklist executed; deltas recorded (handoff + Step 01 cut list where user-visible).

## Handoff record

Title workflow/background-task evidence: pending

Parity deltas: pending

New cuts discovered: pending
