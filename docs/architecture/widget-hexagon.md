# Widget Hexagon

Status: current target implemented incrementally

The reusable widget is a frontend hexagon. That means the React component tree is not the whole architecture. React is the inbound UI adapter around smaller ownership areas.

## First Principle

Hexagonal architecture is dependency direction:

```txt
outside adapters -> application workflows -> domain rules
```

For a frontend package, the outside adapters are things like React, browser `fetch`, SSE frames, local storage, DOM events, and host app callbacks. The domain rules are things like message projection, citation selection, attachment merging, panel geometry, and protocol event interpretation.

## Current Widget Shape

```txt
packages/side-chat-widget/src
  SideChatWidget.tsx
    React shell and composition

  domain/
    appearance.ts
      appearance presets and persistence key
    message-presentation.ts
      attachment/citation/message-view projection rules
    model-selection.ts
      default model and demo model aliases
    panel-geometry.ts
      panel size, offset, resize, drag math

  application/
    stream-event-decoder.ts
      Effect workflow around UI stream-frame decoding

  hooks/
    use-side-chat.ts
      browser transport, history/usage fetches, host command dispatch
    use-side-chat-events.ts
      protocol event to widget message state projection

  ui/
    ChatComposer.tsx
    ConversationPanel.tsx
    QuickActions.tsx
    RenderedChatMessage.tsx
    ResizeHandles.tsx
    WidgetHeader.tsx
    WidgetLauncher.tsx
    WidgetStatus.tsx
```

## Ownership Rules

| Area | Owns | Must not own |
| --- | --- | --- |
| `domain/` | Pure widget rules and small deterministic projections | React state, network calls, provider SDKs, host app internals |
| `application/` | UI workflows where decoding, errors, or async boundaries matter | JSX layout, Hono, AI SDK provider calls |
| `hooks/` | Browser adapters and React state orchestration | Host dashboard implementation details |
| `ui/` | Focused React components | Protocol decoding, network transport, domain policy |
| `SideChatWidget.tsx` | Public shell, state wiring, composition | Message rendering internals, citation parsing, panel math |

## Effect On The Frontend

The frontend does not need Effect everywhere. It uses Effect where a UI workflow crosses a boundary.

Current example:

```txt
SSE frame string
  -> application/stream-event-decoder.ts
  -> Effect workflow parses JSON
  -> shared protocol validates `sidechat.v1`
  -> hook receives `SidechatStreamEvent | undefined`
```

Teaching rule:

```txt
Effect owns the frontend workflow around decoding.
The shared protocol owns the schema.
React owns rendering.
```

Those are not competing libraries. They are different ownership zones.

## Why This Matters For The Work Demo

The architecture argument is not "Node is nicer than Python" or "Effect is better than Zod." The argument is:

```txt
The UI-facing chat product needs a stable product protocol and typed frontend workflow.
```

With this widget shape, a host app can reuse the chat UI without knowing:

- which model provider is used
- whether the backend is OpenAI, private model, or future Python/LangGraph
- how AI SDK provider stream parts look
- how dashboard DB access works

The widget only knows:

- how to send `sidechat.v1` requests
- how to decode `sidechat.v1` events
- how to render message/tool/reasoning/citation/host-command state
- how to call a host bridge for context and serializable UI commands
