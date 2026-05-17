# Side-Chat Widget Learning Guide

Status: local learning path

Read this when you want to understand the reusable React widget package. The widget is a frontend hexagon: host ports outside, pure domain rules inside, React/browser adapters around them, and UI slices for rendering.

## Purpose

`packages/side-chat-widget` provides the embeddable side-chat UI. It sends `sidechat.v1` requests, reads SSE stream events, projects those events into widget messages, dispatches host commands through a host bridge, and renders conversation UI.

```txt
Host app
  -> SideChatWidget public API
    -> React/browser adapter
      -> sidechat.v1 stream decoder
      -> message domain projection
    -> UI slices
```

## Owns / Does Not Own

| Owns | Does not own |
| --- | --- |
| Reusable widget public API. | Host app table implementation. |
| Browser fetch/SSE adapter. | Backend use case. |
| Message projection and presentation rules. | AI SDK provider streams. |
| Panel geometry and widget shell UI. | Postgres/dashboard data access. |
| Vendored AI Elements-derived visual primitives. | Next.js runtime APIs. |

## Read Order

1. [`src/index.ts`](src/index.ts)  
   Public package boundary.

2. [`src/ports/widget-contracts.ts`](src/ports/widget-contracts.ts)  
   Host integration contracts.

3. [`src/domain/message/stream-event-state.ts`](src/domain/message/stream-event-state.ts)  
   Pure stream-event to message-state projection.

4. [`src/application/stream-decoding/stream-event-decoder.ts`](src/application/stream-decoding/stream-event-decoder.ts)  
   Effect decode boundary for streamed JSON frames.

5. [`src/adapters/react/use-side-chat.ts`](src/adapters/react/use-side-chat.ts)  
   Browser lifecycle adapter for fetch, history, usage, host commands, and React state.

   Then read [`src/adapters/react/use-side-chat/`](src/adapters/react/use-side-chat/) for the smaller transport helpers: request payload/endpoint construction and SSE frame reading.

6. [`src/ui/side-chat-widget/SideChatWidget.tsx`](src/ui/side-chat-widget/SideChatWidget.tsx)  
   Public component composition.

7. [`src/ui/conversation-feed/RenderedChatMessage.tsx`](src/ui/conversation-feed/RenderedChatMessage.tsx) and [`src/ui/composer/ChatComposer.tsx`](src/ui/composer/ChatComposer.tsx)  
   Rendering slices.

## Key Folders

| Folder | Why it exists |
| --- | --- |
| `ports/` | Defines what the host app can provide. |
| `domain/` | Pure rules: messages, citations, appearance, model aliases, panel geometry. |
| `application/` | Boundary workflow code, currently stream decoding. |
| `adapters/react/` | Browser and React state adapter. `use-side-chat.ts` is the hook; `use-side-chat/` holds focused request and stream-reader helpers. |
| `ui/` | Product-sliced presentation components. |
| `shared/ui/ai-elements/` | Vendored visual primitives derived from AI Elements. |

## Technology Purpose In Context

### React

React owns rendering, component state, effects, and browser events. It does not own the protocol. The hook adapts React/browser lifecycle to pure domain and protocol modules.

### Effect

Effect is used at the stream decoding boundary. Raw SSE data becomes unknown JSON, then Effect-backed protocol validation turns it into a known `SidechatStreamEvent`.

### AI Elements-Derived UI

The package vendors AI Elements-derived components so consumers do not need to run generators or adopt Next.js-specific assumptions. Treat those files as package-owned visual primitives.

## Boundary Warnings

- Do not require Next.js runtime APIs.
- Do not import host app state or AG Grid.
- Do not put hooks in a global file-type bucket; place them by responsibility.
- Do not expose AI SDK runtime types from the widget public API.
- Do not edit vendored AI Elements-derived primitives for learning comments unless the primitive itself changes.

## Verification

Run from the repository root:

```sh
npm run build --workspace @side-chat/side-chat-widget
npm run verify
```

## Read Next

- [Embedded Host App](../../apps/embedded-host-app/LEARNING.md) for realistic consumption.
- [Shared Protocol](../shared-protocol/LEARNING.md) for stream event shapes.
- [Side-Chat API](../../apps/side-chat-api/LEARNING.md) for the server producer.
