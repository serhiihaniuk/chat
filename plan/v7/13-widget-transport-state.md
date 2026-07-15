# Step 13: Widget — Transport and Chat State

Read this when: reviewing the historical Step 13 transport integration.

Source of truth for: the Step 13 implementation record only. ADR 0017 and Step 16 own the current session/lifecycle architecture.

Not source of truth for: part rendering (Step 14), tool/approval interactions (Step 15), or recovery/multi-tab (Step 16).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

> **Superseded ownership assumption (2026-07-14):** this step correctly adopted
> native stream assembly, but incorrectly made `useChat` the conversation-state
> authority. The current widget uses a widget-lifetime reducer session plus a
> disposable transport-reader epoch. See [ADR 0017](../../docs/adr/0017-native-conversation-reconciliation.md).

Depends on: Steps 07, 10 (their endpoints). Unblocks: Steps 14, 15, 16.

## Outcome

This step originally sent, streamed, and cancelled through `useChat` with `WorkflowChatTransport`, seeded from validated history. That transport adoption remains, but its lifecycle ownership was replaced by the Step 16/ADR 0017 session architecture. This section records the historical milestone rather than the current design.

## Current evidence to verify (the layer being replaced)

- Being replaced: `packages/side-chat-widget/src/features/chat/model/run/{widget-run-reducer,widget-run-projection,widget-run-state,widget-run-store}.ts`, `entities/conversation/api/{sse/side-chat-sse-reader,run/side-chat-turn-stream,run/side-chat-run-client}.ts`.
- Staying (updated shapes only): `entities/conversation/api/query/**` (TanStack Query reads).
- Read `.claude/skills/sidechat-design-system` before touching any widget code.

## Original target design (ownership superseded by ADR 0017)

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

- [x] Historical `useChat` ownership was deleted; the reducer session consumes `WorkflowChatTransport` directly with authenticated request preparation.
- [x] History seeding without duplicate bubbles.
- [x] All six edge cases tested; browser sanity run screenshotted.
- [x] Old state layer untouched but unused by this path.

## Handoff record

Transport/config entry points: `entities/workflow-chat/api/workflow-chat-transport.ts`,
`entities/workflow-chat/model/workflow-chat-client.ts`, and the public
`WorkflowChatClient` / `WorkflowSideChatWidgetProps` exports. The harness's
`workflow-service` mode targets the v7 service without changing legacy modes.

Id-reconciliation approach: the initial stream and replay both stamp the
turn-scoped durable assistant id into `start.messageId`. The reducer upserts
that identity monotonically while replay catches up, so history and live stream
cannot represent the same assistant twice.

Evidence: focused workflow tests 15/15; widget package 229/229; widget and
harness builds; harness test 8/8; browser send/finish and cancel screenshots in
`evidence/13-widget-workflow-{stream,cancelled}.png`, with no page or console
errors. The browser used the reviewed deterministic native-stream interceptor
because the current compiled fake-service artifact fails before boot when the
unrelated DB `#schema-contract` package import escapes the Nitro bundle.

The native public props expose only the shell behavior implemented here. Host
context, activity renderers, quick actions, reasoning presentation, and turn
profiles remain protocol-branch contracts; the shared closed launcher is covered
in the harness.

Client-boundary tests reject malformed native history and prove that unknown HTTP
bodies do not cross into public errors. The import-boundary suite discovers every
production file inside the isolated workflow slices instead of maintaining a
fragile file list.
