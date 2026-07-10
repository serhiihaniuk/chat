# Step 14: Widget — Timeline Rendering from Native Parts

Read this when: rendering message parts into the widget's timeline and terminal presentations.

Source of truth for: the part→component mapping, terminal presentations, and cut-list reconciliation.

Not source of truth for: interactions (Step 15) or state/transport (Step 13).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 06, 13. Unblocks: Step 15.

## Outcome

The widget renders the full native part vocabulary with the existing component library: text, reasoning timeline entries, tool lifecycle rows, sources/files where sanctioned, the Step 01 `data-*` parts, and terminal states. The timeline is re-derived from native parts—no shadow vocabulary.

## Current evidence to verify

- The old timeline semantics being re-derived: activity kinds/statuses in `packages/chat-protocol/src/sidechat-v1/events/event-union.ts` and the widget's rendering of them (locate the timeline components; the design-system skill governs their styling).
- The Step 01 cut list—the authority on what intentionally does not come back.
- The Step 06 profile doc — the authority on which parts exist.

## Target design — part→presentation mapping (the deliverable includes this table, completed)

| Part                                                 | Presentation                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `text-start/-delta/-end`                             | assistant message body, streaming                                                          |
| `reasoning-start/-delta/-end`                        | timeline "thinking" entry, collapsible per current design                                  |
| tool part, state `input-streaming`/`input-available` | timeline tool row, running                                                                 |
| tool part, state `output-available`                  | tool row, completed (result summary per tool metadata)                                     |
| tool part, state `output-error`                      | tool row, failed (safe message)                                                            |
| tool part, state `approval-requested`                | the approval card **display** (interaction in Step 15)                                     |
| tool part, state `output-denied`                     | tool row, denied                                                                           |
| sanctioned `data-*` parts                            | per the Step 01 inventory                                                                  |
| `error` part                                         | error terminal presentation with the vocabulary's retryable flag driving the Retry control |
| blocked representation (per Step 06)                 | blocked terminal, no Retry                                                                 |
| `abort`                                              | calm cancelled, no Retry                                                                   |
| `finish`                                             | completed                                                                                  |
| unknown parts                                        | ignored (forward-compatible), dev-build console note                                       |

Presentation invariants carried from the old reducer: terminal is final (a dev-build guard asserts no rendering change after terminal); cancelled and blocked have no Retry; error respects `retryable`.

## Cut-list reconciliation

Render a scripted turn containing every old activity kind's scenario; anything the old widget showed that the new rendering cannot express is either (a) on the Step 01 cut list—confirmed fine, or (b) a new discovery—surface it back to the Step 01 list for a decision rather than silently inventing a part.

## Edge cases (each a test)

1. every row of the mapping table renders from a scripted stream (component-level snapshot-free assertions);
2. multi-step turn: interleaved reasoning/tool/text parts group into a coherent timeline order;
3. empty assistant message renders sanely;
4. reasoning-only turn renders;
5. unknown part type: ignored, no crash, dev note fired;
6. terminal-is-final guard: a synthetic post-finish part changes nothing;
7. theme audit: new/adjusted components pass the design-system skill's token/density rules across all four themes.

## Verification

```powershell
npm test -- packages/side-chat-widget
npm run typecheck
npm run lint:custom
```

Browser check via the preview workflow across themes; screenshot evidence.

## Completion checklist

- [ ] Mapping table implemented and recorded (completed table in handoff).
- [ ] Presentation invariants enforced with tests.
- [ ] Cut list reconciled; new discoveries escalated to Step 01's list.
- [ ] Theme audit passed; screenshots recorded.

## Handoff record

Completed mapping table: pending

New cuts discovered: pending

Components added/changed: pending
