# Step 13: Widget — Transport and Chat State

Read this when: wiring the widget's chat state onto `useChat` and `WorkflowChatTransport`.

Source of truth for: transport configuration, auth wiring, history seeding, and send/stream/cancel state behavior.

Not source of truth for: part rendering (Step 14), tool/approval interactions (Step 15), or recovery/multi-tab (Step 16).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 07, 10 (their endpoints). Unblocks: Steps 14, 15, 16.

## Outcome

The widget sends a message, streams the answer, and cancels — through `useChat` (`@ai-sdk/react`) with `WorkflowChatTransport`, seeded from validated history. Rendering may be minimal/raw in this step (text only); the old state layer is untouched and still present (deleted in Step 20). Component library and design system untouched.

## Current evidence to verify (the layer being replaced)

- Being replaced: `packages/side-chat-widget/src/features/chat/model/run/{widget-run-reducer,widget-run-projection,widget-run-state,widget-run-store}.ts`, `entities/conversation/api/{sse/side-chat-sse-reader,run/side-chat-turn-stream,run/side-chat-run-client}.ts`.
- Staying (updated shapes only): `entities/conversation/api/query/**` (TanStack Query reads).
- Read `.claude/skills/sidechat-design-system` before touching any widget code.

## Target design

- One `useChat` per open conversation; `id` = conversation id; initial messages seeded from the Step 10 history read (validated `UIMessage[]`).
- Transport: `WorkflowChatTransport` — `api` → Step 05 POST; auth headers/credentials/body via the prepare-hook functions (`prepareSendMessagesRequest`, `prepareReconnectToStreamRequest` — functions, so token refresh works); reconnect target Step 07's GET; `maxConsecutiveErrors` from config. (Reconnect _behavior_ is Step 16's scope; this step only wires the transport correctly.)
- Cancel: the stop control drives Step 05's cancel route.
- Keepalive comment frames must be transparent to the transport decoder (test).
- State invariants preserved from the old reducer (presentation contracts Step 14 builds on): terminal is final; cancel produces a calm cancelled state, not an error; a transport drop is "reconnecting", never terminal (full ladder in Step 16).
- TanStack Query keeps owning conversations/models/history reads against the Step 10 shapes.

## Edge cases (each a test)

1. send → stream → finish: message list correct, exactly one assistant message, no duplicate bubbles from seed-vs-stream overlap (id reconciliation with Step 09's id policy);
2. cancel mid-stream → calm cancelled state; the run actually aborted (server assertion);
3. server busy/policy 4xx on send → typed calm error, no retry loop;
4. auth token refresh mid-session → prepare hooks pick up the new token (function, not captured value);
5. keepalive frames invisible to state;
6. bundle hygiene: no `effect`, no `@ai-sdk/openai|azure`, no `@side-chat/chat-protocol` in the widget import graph (the new path).

## Verification

```powershell
npm test -- packages/side-chat-widget
npm run typecheck
npm run lint:custom
rg -n "from '@side-chat/chat-protocol'" packages/side-chat-widget/src
```

Plus a browser sanity run against the new wing (fake provider) via the preview workflow: send, watch stream, cancel.

## Completion checklist

- [ ] useChat + `WorkflowChatTransport` wired with auth prepare hooks.
- [ ] History seeding without duplicate bubbles.
- [ ] All six edge cases tested; browser sanity run screenshotted.
- [ ] Old state layer untouched but unused by this path.

## Handoff record

Transport/config entry points: pending

Id-reconciliation approach: pending
