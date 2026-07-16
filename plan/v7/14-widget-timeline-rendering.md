# Step 14: Widget — Timeline Rendering from Native Parts

Read this when: rendering message parts into the widget's timeline and terminal presentations.

Source of truth for: the part→component mapping, terminal presentations, and cut-list reconciliation.

Not source of truth for: interactions (Step 15) or state/transport (Step 13).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 06, 13. Unblocks: Step 15.

## Outcome

The widget renders the available native UIMessage part vocabulary with the existing component library: text, reasoning timeline entries, static and dynamic tool lifecycle rows, approval-requested display, sources/files where sanctioned, and terminal states. `SideChatDataParts` is intentionally empty in the current stream profile, so the widget invents no `data-*` parts. The timeline is re-derived from native parts—no shadow vocabulary.

## Current evidence to verify

- The old timeline semantics being re-derived: activity kinds/statuses in `packages/chat-protocol/src/sidechat-v1/events/event-union.ts` and the widget's rendering of them (locate the timeline components; the design-system skill governs their styling).
- The Step 01 cut list—the authority on what intentionally does not come back.
- The Step 06 profile doc — the authority on which parts exist.

## Target design — part→presentation mapping (the deliverable includes this table, completed)

| Part                                                 | Presentation                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `text` UIMessage part                                | assistant message body, streaming                                          |
| `reasoning` UIMessage part                           | timeline "thinking" entry, collapsible per current design                  |
| tool part, state `input-streaming`/`input-available` | timeline tool row, running                                                 |
| tool part, state `output-available`                  | tool row, completed (result summary per tool metadata)                     |
| tool part, state `output-error`                      | tool row, failed (safe message)                                            |
| tool part, state `approval-requested`                | the approval card **display** (interaction in Step 15)                     |
| tool part, state `output-denied`                     | tool row, denied                                                           |
| `source-url` / `source-document` UIMessage part      | existing source fold; URL opening keeps the existing safety boundary       |
| sanctioned `file` UIMessage part                     | inline data-image or non-network file presentation                         |
| `error` callback / `finish(error)`                   | error terminal presentation with stream-profile retryability driving Retry |
| `finish(content-filter)`                             | blocked terminal, no Retry                                                 |
| abort callback                                       | calm cancelled, no Retry                                                   |
| `finish` callback                                    | completed; `length` also shows the existing calm truncation notice         |
| unknown parts                                        | ignored (forward-compatible), dev-build console note                       |

Presentation invariants carried from the old reducer: terminal is final at the observed part-count boundary; cancelled and blocked have no Retry; recognized errors use the stream-profile safe message and `retryable` flag.

## Cut-list reconciliation

The old `ACTIVITY_KINDS`/`ACTIVITY_STATUSES` reducer and ADR 0007 disposition were reconciled during implementation. Generic progress, provider metadata, host-command vocabulary, recovery markers, and local recovery UI remain cut. Native tool lifecycle, approval display, source/file presentation, and terminal safety states are expressed through existing component-library primitives; no new data parts or protocol behavior were introduced.

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

- [x] Mapping table implemented and recorded (completed table in handoff).
- [x] Presentation invariants enforced with tests.
- [x] Cut list reconciled; no new discoveries requiring Step 01 changes.
- [x] Theme audit passed; screenshots recorded.

## Handoff record

Completed mapping table: `native-message-projection.ts` maps text, reasoning, static/dynamic tools, approval-requested display, output-denied, source URL/document, sanctioned files, terminal callbacks, and unknown-part notes. `workflow-message-timeline.tsx` uses existing `Message`, `Reasoning`, `ToolRow`, `ToolDetailRow`, `SourcesFold`, `ActivityImages`, and calm terminal notices.

New cuts discovered: none. The baseline `SideChatDataParts` remains empty; Step 15 owns approval decisions and network interaction.

Components added/changed: native workflow timeline and projection; stream-profile terminal/error integration; shared denied tool glyph and calm cancelled/truncated notices; four widget labels. No copied `shared/ai` files or legacy protocol rendering changed.

Theme/browser evidence: the deterministic `workflow-service` harness fixture rendered the native timeline without console errors or framework overlays in all four named themes. Screenshots: [`graphite`](./evidence/task-14-widget-timeline/graphite.png), [`sapphire`](./evidence/task-14-widget-timeline/sapphire.png), [`sage`](./evidence/task-14-widget-timeline/sage.png), and [`ocean`](./evidence/task-14-widget-timeline/ocean.png). The browser interaction check also proved the completed reasoning fold opens and reveals its trace. `agent-browser` was unavailable in this environment, so the same checklist was executed with the repository's installed Playwright runtime against the Vite harness.

Verification evidence: focused workflow boundary/timeline tests 17/17; complete widget suite 242/242; widget package typecheck, scoped Oxlint, custom governance, touched-file formatting, and diff checks green. Repository-wide typecheck and Oxlint have zero Task 14 hits and remain red only in unrelated active partner-service/DB work.
