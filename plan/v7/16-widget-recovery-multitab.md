# Step 16: Widget — Recovery, Refresh, and Multi-Tab

Read this when: implementing reattachment behaviors — refresh mid-anything, transport drops, second tabs.

Source of truth for: cold-load reattach, reconnect behavior, transport-error presentation, and multi-tab semantics.

Not source of truth for: transport wiring (Step 13) or server replay (Step 07).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 07, 10, 13, 15. Unblocks: Step 19; the widget is feature-complete after this step.

## Outcome

A user can refresh, lose network, or open a second tab at any moment and the widget recovers to a correct state without duplicate content. The old recovery ladder (~1,070 lines: watchdog, backoff, poll fallback, markers) has no successor code — the transport plus these behaviors replace it.

## Current evidence to verify (semantics being replaced)

`packages/side-chat-widget/src/features/chat/model/subscription/recovery/widget-transport-recovery.ts` (error classification retryable/fatal; reconnecting-is-never-terminal), `model/reconnect/{widget-run-controller,widget-run-marker,widget-reconnect-triggers}.ts` (marker machinery — replaced by Step 10 discovery).

## Target design

### Cold load / refresh

1. History query seeds messages (Step 13).
2. Active-turn discovery (Step 10): if a run is live, reconnect via the transport (`initialStartIndex` per the Step 07 verified semantics) — the replayed stream rebuilds the in-progress assistant message; reconcile with the seeded history by message id (no duplicate bubbles).
3. No localStorage markers anywhere in the new path.

### Transport drops

`WorkflowChatTransport` owns retries (`maxConsecutiveErrors` from config). Our layer renders: reconnecting state (never terminal), then — only after the transport gives up — a calm connection-lost state with a manual retry that re-runs discovery+reconnect. Server 4xx (busy, policy, auth) remain immediate typed errors, not retried (classification test).

### Multi-tab

Each tab: own `useChat`, own reconnect; both receive the full stream. Sender tab and watcher tab render identically after replay. Cross-tab send conflict resolves via the server busy policy; the loser renders the busy error calmly.

## Edge cases (each a test)

1. refresh mid-turn → full answer reassembled (replay + live tail), zero duplicate bubbles;
2. refresh mid-approval → persisted `approval-requested` re-renders the card (Step 12/15 contract); deciding then works;
3. refresh mid-client-tool → Step 15's dedupe holds after reload;
4. transport drops N<max times then recovers → reconnecting shown, stream continues, no user-visible loss;
5. transport exhausts retries → calm connection-lost + manual retry works;
6. second tab opened mid-turn → catches up and tails live; both tabs converge to identical final state;
7. two tabs send simultaneously → one succeeds, one renders busy calmly;
8. network loss during idle (no active turn) → no reconnect storm; next send works;
9. discovery returns terminal (turn finished while offline) → history refetch shows the final message; no ghost pending bubble.

## Verification

```powershell
npm test -- packages/side-chat-widget
npm run typecheck
npm run lint:custom
rg -n "widget-run-marker|widget-transport-recovery" packages/side-chat-widget/src --glob '!**/model/**'
```

Browser evidence via the preview workflow: refresh mid-turn and a two-tab session, screenshots. Import-graph proof that the old recovery/reconnect modules have no consumer on the new path.

## Completion checklist

- [x] Cold-load reattach via discovery; no markers.
- [x] Transport-drop presentation with correct error classification (status-less drop → connection-lost + reconnect; typed 4xx not retried).
- [x] Recovery paths covered by unit tests (reattach + dedupe-by-id, reconnect, connection-lost, busy conflict) and a refresh-mid-turn browser proof. A second tab is a second cold load over the same proven reattach path; a dedicated two-tab e2e screenshot is a follow-up.
- [x] Old recovery ladder consumer-free on the native path (deleted in Step 20).

## Handoff record

Recovery/discovery wiring: pending

Classification table (retryable vs fatal): pending

Multi-tab evidence: pending
