# 19 — Widget terminal semantics: cancelled, blocked, replay dedupe

**Epic:** 3 Protocol | **Priority:** P1 | **Depends on:** 16 (blocked status), coordinates with 06/07 | **Status:** done

## Problem

1. **Cancel renders as a red error with a Retry button.** The server's synthetic terminal for a user cancel is `sidechat.error` with `code: "aborted"` (`finalize-turn-generation.ts:124,210`); the reducer maps every ERROR to FAILED without inspecting the code (`packages/side-chat-widget/src/features/chat/model/run/widget-run-reducer.ts:107-108`). A turn cancelled in another tab — or when the cancel POST loses the race — shows an error + Retry.
2. **Blocked collapses into FAILED with a Retry** (`widget-run-reducer.ts:109-110`) — inviting resubmission of content-filtered input; no distinct blocked treatment exists (`error-notice.tsx:31-36` always offers "Try again").
3. **Host commands re-execute on reload replay:** cold resumes replay from `after=-1` with a fresh dedupe set; `maybeDispatchHostCommand` dispatches regardless of the event's `status` or an existing `result` (`widget-run-subscription.ts:65-82`) — reload mid-turn after `open_resource` re-navigates the host and posts a duplicate result.
4. Reducer dead code: unreachable HISTORY case (`widget-run-reducer.ts:81` early-return vs `:113`), `runErrorMessage` aliasing `toErrorMessage` (`:170`).

## Decided approach

1. Reducer branches on the error code: `sidechat.error(code=aborted)` → status CANCELLED (calm "Stopped" treatment, no Retry, no red).
2. BLOCKED becomes its own run status: distinct notice using the event's `publicMessage` + `reason`, **no Retry action**. UI: a quiet guard-styled notice (coordinate tokens with the design system; `--destructive` for error, a neutral/warning tone for blocked).
3. Host-command dispatch guard: skip when `event.status !== "running"` or `details.hostCommand.result !== undefined` — replayed completed commands never re-dispatch (dedupe by activityId stays for the live path).
4. Delete the reducer dead code; keep the pure-reducer test discipline (every new transition unit-tested: aborted-code error, blocked, replay-with-result host command).
5. Story 06's handoff treats CANCELLED/BLOCKED like other terminals (refetch history, clear run — the notice lives until clear; verify UX in harness).

## Acceptance criteria

- [x] Cancel from another tab renders the calm cancelled state, no Retry — reducer maps `error(code=aborted)` → CANCELLED with no notice; unit-tested. The two-page e2e is deferred (the in-memory mock has no shared backend for cross-tab cancel — needs local-service mode; see notes).
- [x] A blocked turn shows the public message with no Retry (new `blocked` mock scenario + e2e; role=status notice, no "Try again").
- [~] Reload mid-turn after a host command: the command does not re-execute — the widget dispatch guard is implemented and unit-tested; the paired server-side replay enrichment (without which the guard is inert in production) + the reload e2e are chipped (`task_ba383d90`).
- [x] Reducer tests cover all three transitions; dead code gone.

## Delivery notes (2026-07-03)

- **Cancel is calm.** `applyEventRunFields` branches on the error code: `sidechat.error(code=aborted)` → `WIDGET_RUN_STATUSES.CANCELLED` with no `errorMessage`, so the conversation view shows no red notice and no Retry — aligning an other-tab/lost-race cancel with a same-tab stop. Every other code stays FAILED with its message.
- **Blocked is its own terminal.** New `WIDGET_RUN_STATUSES.BLOCKED` (terminal, maps to idle WidgetStatus). The reducer keeps the `publicMessage`; a new `BlockedNotice` (neutral `ShieldAlert` glyph, `role="status"`, **no** "Try again") renders it, distinct from the red `role="alert"` `ErrorNotice`. The view now takes a discriminated `WidgetRunNotice` (`{kind: "error"|"blocked", message}`, in `#entities/chat` so both features share it) instead of a bare `errorMessage`.
- **Host-command replay guard.** `maybeDispatchHostCommand` now skips when `event.status !== "running"` or `event.details.hostCommand.result !== undefined`, so a cold resume never re-executes an already-resolved command. Caveat (chipped): the durable log currently replays host_command events as `running`/no-result, so this guard needs the server to fold persisted `host_command_results` into the replay to actually fire in production.
- **Dead code removed.** The unreachable HISTORY case in `applyEventRunFields` is gone (its param is now `Exclude<…, HistoryEvent>`, since `applyEvent` already returns early on HISTORY); `runErrorMessage` (an alias for `toErrorMessage`) is deleted and its 3 callers repointed at `toErrorMessage`.
- **Tests.** Store test covers aborted→CANCELLED (no message), non-aborted→FAILED, and blocked→BLOCKED; new subscription test covers the host-command guard (live dispatches, replayed-with-result/non-running skip); the conversation test now covers both notice kinds. e2e adds the blocked scenario (13/13).
- Verification: widget + harness suites green (154), `npm run verify` clean, e2e 13/13.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget -- widget-run-reducer
npm run test:e2e
npm run verify
```
