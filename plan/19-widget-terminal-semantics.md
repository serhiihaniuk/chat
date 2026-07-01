# 19 — Widget terminal semantics: cancelled, blocked, replay dedupe

**Epic:** 3 Protocol | **Priority:** P1 | **Depends on:** 16 (blocked status), coordinates with 06/07 | **Status:** todo

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

- [ ] Cancel from another tab renders the calm cancelled state, no Retry (harness e2e: two pages, cancel in one).
- [ ] A blocked turn shows the public message with no Retry (mock-stream blocked scenario — add one to `test-harness/widget-harness/src/config/modes.ts`, which currently has none).
- [ ] Reload mid-turn after a host command: the command does not re-execute (e2e with the demo `open_resource`).
- [ ] Reducer tests cover all three transitions; dead code gone.

## Verification

```sh
npm test --workspace @side-chat/side-chat-widget -- widget-run-reducer
npm run test:e2e
npm run verify
```
