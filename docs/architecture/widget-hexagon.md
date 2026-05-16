# Widget Hexagon

Status: implemented target

The reusable widget is a frontend hexagon. In backend language, React is the primary inbound adapter: the user interacts with React, React calls application workflows, and those workflows depend on stable domain rules and ports.

The point is dependency direction, not folder decoration:

```txt
outside technologies -> adapters -> application workflows -> domain rules
                              ports define contracts ^
```

For this package, outside technologies are React, browser `fetch`, SSE frames, local storage, DOM pointer events, and host app callbacks. Domain rules are message projection, citation selection, attachment merging, model aliases, appearance presets, and panel geometry.

## Current Shape

```txt
packages/side-chat-widget/src/
  index.ts
    public package API only

  ports/
    widget-contracts.ts
      host bridge, identity, and transport contracts

  domain/
    appearance/appearance.ts
      pure appearance preset rules
    message/message-presentation.ts
      attachment/citation/message-view projection rules
    message/stream-event-state.ts
      sidechat stream event -> widget message state rules
    model/model-selection.ts
      model alias rules for the demo picker
    panel/panel-geometry.ts
      panel size, offset, resize, and drag math

  application/
    stream-decoding/stream-event-decoder.ts
      Effect workflow around stream-frame decoding

  adapters/
    react/use-side-chat.ts
      browser fetch/SSE/history/usage and host-command orchestration

  ui/
    side-chat-widget/
      SideChatWidget.tsx
      WidgetLauncher.tsx
    panel-shell/
      WidgetHeader.tsx
      WidgetStatus.tsx
      ResizeHandles.tsx
      use-panel-shell.ts
    conversation-feed/
      ConversationPanel.tsx
      RenderedChatMessage.tsx
    composer/
      ChatComposer.tsx
      QuickActions.tsx

  shared/
    ui/ai-elements/
      vendored AI Elements-derived primitives
    lib/
      tiny UI utilities used by shared UI primitives
```

## Ownership Rules

| Area | Owns | Must not own |
| --- | --- | --- |
| `ports/` | Contracts the outside world must satisfy | Implementations, React state, provider SDK details |
| `domain/` | Pure deterministic widget rules | React hooks, network calls, browser APIs, JSX layout |
| `application/` | Workflows where boundary parsing or async/error semantics matter | JSX layout, Hono, provider adapters |
| `adapters/react/` | React/browser adapter orchestration for application workflows | Host dashboard internals, provider stream parts |
| `ui/<slice>/` | Presentation components and slice-local UI hooks | Protocol ownership, network transport, domain policy |
| `shared/ui/` | Reusable visual primitives | Product workflow and host-specific behavior |

## Hooks Rule

Do not create a global `hooks/` folder. A hook is placed by what it owns:

| Hook kind | Location | Example |
| --- | --- | --- |
| Application adapter hook | `adapters/react/` | `use-side-chat.ts` owns browser transport, stream reading, history/usage, and host command dispatch |
| Presentation-only hook | `ui/<slice>/` | `panel-shell/use-panel-shell.ts` owns panel open/close, focus restore, drag, resize, fullscreen |
| Pure rule helper | `domain/<domain>/` | `panel-geometry.ts` owns clamp and resize math without React |
| Shared primitive helper | `shared/ui/` or `shared/lib/` | `cn()` supports vendored UI primitives |

That is the difference between architecture and file-type buckets. A file is not placed because it is a hook or component. It is placed where its responsibility belongs.

## UI Micro-Slices

The UI layer is intentionally sliced by product surface:

- `side-chat-widget/` composes the public widget shell.
- `panel-shell/` owns the movable/resizable container and header/status controls.
- `conversation-feed/` owns message list rendering.
- `composer/` owns prompt input and quick actions.

These slices may import domain rules and adapter outputs, but they should not import each other freely. Composition flows through `side-chat-widget/`, which acts like a widget-level page shell.

## Effect On The Frontend

Effect does not need to own every button click. It is most useful where a UI workflow crosses a boundary and needs typed decoding, controlled failure, or composable async work.

Current example:

```txt
SSE frame string
  -> application/stream-decoding/stream-event-decoder.ts
  -> Effect workflow parses JSON
  -> shared protocol validates sidechat.v1
  -> adapters/react/use-side-chat.ts applies domain state transitions
  -> ui/conversation-feed renders the result
```

Teaching rule:

```txt
Shared protocol owns the schema.
Effect owns boundary workflows around that schema.
React owns presentation and browser lifecycle.
Domain owns product rules.
```

These are ownership zones, not competing libraries.

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
