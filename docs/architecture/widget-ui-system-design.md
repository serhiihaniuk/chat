# Widget UI Technical System Design

Date: 2026-05-23

Status: Draft implementation design.

This document defines the technical UI architecture for
`packages/side-chat-widget`. It uses a trimmed Feature-Sliced Design shape that
fits this package without importing the full FSD ceremony.

This document complements `docs/architecture/production-system-design.md`, which
owns repository-wide package boundaries, protocol, service, runtime,
persistence, and governance.

## 1. Goal

Move the widget from a styled scaffold to a feature-complete workspace assistant
surface while keeping the UI package:

- browser-safe;
- protocol-driven;
- host-app agnostic;
- easy to test in the harness;
- small enough that feature slices stay understandable.

## 2. Trimmed FSD Decision

Use these layers only:

```txt
app -> features -> entities -> shared
```

Do not use these FSD layers:

- `pages`: the package has no routes.
- `processes`: flows are small enough to live in `app` or feature `model`.
- `widgets`: the whole package is the widget; adding an FSD `widgets` layer
  would be confusing.

Layer meanings:

| Layer      | Purpose                                                                                                                         | May import                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `app`      | Public widget component, controller wiring, async flows, top-level state composition.                                           | `features`, `entities`, `shared`, public external packages. |
| `features` | User-facing capabilities: composer, conversation, panel controls, quick actions, context scope, model selection, host commands. | `entities`, `shared`, public external packages.             |
| `entities` | Product nouns and protocol projections: message, source, tool event, host command, model option, context snapshot.              | `shared`, public protocol types.                            |
| `shared`   | Local component libraries, local icons/assets, generic helpers, Tailwind class helpers.                                         | approved public external packages only.                     |

Import direction is strict. Lower layers must not import higher layers.

## 3. Local UI Library Stack

The widget uses copied/adapted component source as owned repository code, not as
installed UI-kit packages. The dependency ladder is:

```txt
approved packages
  -> shared/lib
  -> shared/ui
  -> shared/ai
  -> features/*/ui
  -> app
```

Approved packages for this ladder are React, Tailwind 4, `@base-ui/react`,
`class-variance-authority`, `clsx`, and `tailwind-merge`. Local icons/assets and
`shared/lib/cn` are also allowed. Do not install or import `shadcn`,
`@repo/shadcn-ui`, `ai-elements`, `lucide-react`, or AI SDK UI message types in
the widget.

### 3.1 `shared/ui`: Local Primitive Library

`shared/ui` is the local shadcn-style primitive library. Files such as
`shared/ui/button.tsx` may start from copied/adapted shadcn-style source, but
after copying they are first-party widget code.

`shared/ui` may import:

- React;
- Tailwind 4 classes;
- `@base-ui/react` primitives for behavior-heavy controls;
- `class-variance-authority`;
- `shared/lib/cn`;
- local assets/icons only when the component is explicitly icon-related.

`shared/ui` must not import:

- `shadcn`, `@repo/shadcn-ui`, or any generated shadcn registry output;
- `ai-elements` or Vercel AI Elements source as a dependency;
- AI SDK, provider SDK, protocol DTOs, chat client, host bridge, app state,
  feature state, or entity projections.

Initial primitive targets:

| Primitive    | Local owner | Notes                                                         |
| ------------ | ----------- | ------------------------------------------------------------- |
| `Button`     | `shared/ui` | CVA variants, Base UI behavior only if needed.                |
| `IconButton` | `shared/ui` | Stable square dimensions, accessible label, optional tooltip. |
| `Textarea`   | `shared/ui` | Composer-safe textarea behavior and sizing.                   |
| `Tooltip`    | `shared/ui` | Base UI tooltip behavior.                                     |
| `Menu`       | `shared/ui` | Base UI menu/select behavior where needed.                    |
| `Badge`      | `shared/ui` | Status/source/model chips without product semantics.          |
| `Spinner`    | `shared/ui` | Generic pending state only.                                   |

### 3.2 `shared/ai`: Local AI Component Library

`shared/ai` is the local Vercel AI Elements-style component library. Files in
this folder may start from copied/adapted Vercel AI Elements source, but after
copying they are first-party widget code. They compose `shared/ui`; they do not
replace it.

`shared/ai` may import:

- React;
- Tailwind 4 classes;
- `shared/ui` primitives;
- `shared/lib/cn`;
- local assets/icons.

`shared/ai` must not import:

- `ai-elements`;
- `shadcn`, `@repo/shadcn-ui`, or shadcn registry output;
- AI SDK UI message types;
- protocol DTOs, chat client, host bridge, app state, feature state, or entity
  projections.

Local mapping:

| Vercel AI Elements-style pattern       | Local owner | Local component target                            | Input boundary                            |
| -------------------------------------- | ----------- | ------------------------------------------------- | ----------------------------------------- |
| `Conversation` / conversation viewport | `shared/ai` | `conversation.tsx`                                | Generic items/render callbacks only.      |
| `Message`                              | `shared/ai` | `message.tsx`                                     | Generic role/content props only.          |
| `Response` / rendered assistant text   | `shared/ai` | `response.tsx`                                    | Renderable text/parts, not protocol DTOs. |
| `Reasoning`                            | `shared/ai` | `reasoning.tsx`                                   | Generic title/state/content props.        |
| `Tool` / tool part                     | `shared/ai` | `tool.tsx`                                        | Generic name/status/body props.           |
| `Sources` / `Source`                   | `shared/ai` | `source.tsx`                                      | Generic source label/href/metadata props. |
| `PromptInput`                          | `shared/ai` | `prompt-input.tsx`                                | Plain value/change/submit/slot props.     |
| Loading affordances                    | `shared/ui` | `spinner.tsx`; composed by `shared/ai` as needed. | Generic pending state only.               |

Feature UI owns the product adapter layer. For example,
`features/conversation/ui/conversation-feed.tsx` maps `ConversationState` and
message/source/tool projections into generic `shared/ai` props, while
`features/composer/ui/chat-composer.tsx` maps `ComposerState`, context controls,
model controls, and submit intents into `shared/ai/prompt-input.tsx`.

## 4. Source Layout Contract

Day-1 implementation must use the trimmed FSD layers below. Files listed here
without a current product behavior are layout targets, not permission to add fake
UI. A folder becomes day-1 only when the behavior and tests exist.

```txt
packages/side-chat-widget/src/
  index.ts
  styles.css

  app/
    side-chat-widget.tsx
    widget-controller.ts
    widget-view.tsx
    widget.types.ts
    flows/
      send-message-flow.ts
      host-command-flow.ts
      load-history-flow.ts

  features/
    panel/
      index.ts
      model/
        panel-state.ts
        panel-reducer.ts
        panel-actions.ts
        panel-geometry.ts
      ui/
        panel-shell.tsx
        panel-header.tsx
        panel-status.tsx
        settings-panel.tsx
        resize-handles.tsx

    conversation/
      index.ts
      model/
        conversation-state.ts
        stream-event-reducer.ts
        selectors.ts
      ui/
        conversation-feed.tsx
        conversation-empty.tsx
        conversation-error.tsx
        message-row.tsx
        assistant-message.tsx
        reasoning-part.tsx
        tool-part.tsx
        host-command-part.tsx
        sources-row.tsx

    composer/
      index.ts
      model/
        composer-state.ts
        composer-reducer.ts
        submit-rules.ts
      ui/
        chat-composer.tsx
        send-button.tsx

    quick-actions/
      index.ts
      model/
        quick-action.ts
        quick-action-resolver.ts
      ui/
        quick-actions-row.tsx

    context-scope/
      index.ts
      model/
        context-state.ts
        context-display.ts
      ui/
        context-selector.tsx
        context-usage.tsx

    model-selection/
      index.ts
      model/
        model-state.ts
        model-display.ts
      ui/
        model-selector.tsx

  entities/
    message/
      index.ts
      model.ts
      projection.ts
    source/
      index.ts
      model.ts
      projection.ts
    tool/
      index.ts
      model.ts
      projection.ts
    host-command/
      index.ts
      model.ts
      projection.ts
    model-option/
      index.ts
      model.ts
    host-context/
      index.ts
      model.ts
      projection.ts

  shared/
    ui/
      button.tsx
      badge.tsx
      icon-button.tsx
      menu.tsx
      tooltip.tsx
      textarea.tsx
      spinner.tsx
    ai/
      conversation.tsx
      message.tsx
      prompt-input.tsx
      reasoning.tsx
      response.tsx
      source.tsx
      tool.tsx
    assets/
      icons/
        panel-icons.tsx
      images/
        README.md
    lib/
      assert-never.ts
      cn.ts
      unknown-record.ts
```

The repository now enforces the first migration/refactor step:

- widget source uses `app/features/entities/shared`, not
  `application/domain/ui`;
- `src/index.ts` exports only the app-level public API;
- feature UI maps feature state into generic `shared/ai` components;
- `shared/ai` and `shared/ui` do not import product packages or feature state;
- fake scaffold labels such as static context percentages, fake model names, and
  static source chips are blocked.
- app composition is split into `side-chat-widget.tsx`,
  `widget-controller.ts`, `widget-view.tsx`, and flow files.

During later migration, do not create a parallel duplicate implementation; move
one capability slice at a time and keep tests green.

## 5. Public API

`src/index.ts` is the package public boundary.

Target public props:

```ts
export type SideChatWidgetProps = {
  readonly client: ChatClient;
  readonly hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand">;
  readonly initialState?: SideChatWidgetStateSnapshot;
  readonly labels?: SideChatWidgetLabels;
  readonly panelActions?: SideChatWidgetPanelActions;
  readonly quickActions?: readonly SideChatWidgetQuickAction[];
  readonly requestFactory?: (
    message: string,
    hostContext?: HostContext,
  ) => ChatStreamRequest;
};
```

Public API rules:

- Allow `ChatClient`, `HostBridge`, and `chat-protocol` DTOs.
- Do not expose internal feature/entity/shared paths.
- Do not export reducers, feature components, shared primitives, or test helpers
  from `src/index.ts`.
- Do not expose Effect programs.
- Do not expose AI SDK, provider, DB, Hono, Drizzle, or service config types.
- If host-controlled state is needed, add explicit controlled props/callbacks.
- `[Future]` Model catalog, context options, and controlled panel state may be
  added after the real data contract exists.

## 6. State Ownership

Top-level state is composed in `app`.

```ts
type WidgetControllerState = {
  readonly panel: PanelState;
  readonly conversation: ConversationState;
  readonly composer: ComposerState;
  readonly context: ContextScopeState;
  readonly model: ModelSelectionState;
};
```

Feature state is owned by feature `model` files. Entity files define reusable
product nouns and projections, not UI component state.

### Panel

Owns:

- open/minimized/closed visibility;
- floating/expanded/docked mode;
- settings visibility;
- geometry and resize intent;
- header action availability.

Required actions:

- `new_chat`;
- `toggle_settings`;
- `toggle_expanded`;
- `close`;
- `minimize`;
- `resize_started`;
- `resize_changed`;
- `resize_committed`.

### Conversation

Owns:

- idle/streaming/completed/error status;
- conversation id;
- assistant turn id;
- projected turns;
- active assistant turn;
- terminal error.

Consumes:

- `sidechat.started`;
- `sidechat.delta`;
- `sidechat.reasoning`;
- `sidechat.tool`;
- `sidechat.host_command`;
- `sidechat.completed`;
- `sidechat.error`;
- `sidechat.history`.

Conversation feature should not render raw protocol events directly. It should
render projections built from `entities/*`.

### Composer

Owns:

- textarea value;
- submit availability;
- submitting/disabled state;
- submit keyboard rule.

Composer does not own quick action definitions, model selection, or context
selection. It receives those as feature state/callbacks.

### Quick Actions

Owns:

- quick action definitions;
- quick action availability;
- resolution to either prompt submission or host-command intent.

Default quick actions:

- Summary;
- Risk brief;
- Report;
- Top client;
- Review.

### Context Scope

Owns:

- selected scope: `page`, `workspace`, or `selection`;
- optional context usage percent;
- current host context display title;
- available source summaries.

Do not show fake context usage. If percent is unavailable, omit it or render an
unknown state.

### Model Selection

Owns:

- available model options;
- selected model id;
- loading/unavailable state;
- display label.

Model options can be supplied by props or a browser-safe client path. The widget
must not import service config or provider registries.

## 7. Entity Ownership

Entities are the stable product nouns used across features.

| Entity         | Owns                                                                 | Source inputs                                        |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| `message`      | user/assistant/system message projection, markdown-ready text parts. | `ChatStreamRequest`, `HistoryMessage`, delta events. |
| `source`       | source id, label, disabled/action state.                             | host context, future citation events.                |
| `tool`         | tool display status and result/error summary.                        | `sidechat.tool`.                                     |
| `host-command` | pending/applied/failed host command projection.                      | `sidechat.host_command`, `HostCommandResult`.        |
| `model-option` | model id, label, availability display.                               | props or model metadata client.                      |
| `host-context` | page/workspace/selection context display.                            | `hostBridge.getContext`.                             |

Entities can import protocol types and `shared` helpers. Entities cannot import
features or React UI.

## 8. Data Flow

Submit flow:

```txt
features/composer UI
  -> app controller intent
  -> hostBridge.getContext()
  -> app requestFactory({ message, selectedModel, context })
  -> chatClient.streamChat(request)
  -> sidechat.v1 events
  -> features/conversation reducer
  -> entities projections
  -> feature UI render
```

Host command flow:

```txt
sidechat.host_command event
  -> entities/host-command projection
  -> features/conversation pending part
  -> app/flows/host-command-flow dispatches hostBridge.dispatchCommand
  -> HostCommandResult
  -> features/conversation updates part
```

Quick action flow:

```txt
features/quick-actions UI
  -> quick-action resolver
  -> prompt intent OR host-command intent
  -> app controller routes into submit or host command flow
```

Panel action flow:

```txt
features/panel UI
  -> panel reducer
  -> optional app onPanelAction callback
```

## 9. UI Composition

`app/widget-view.tsx` composes the screen:

```tsx
<PanelShell>
  <PanelHeader />
  <ConversationFeed />
  <QuickActionsRow />
  <ChatComposer
    contextControl={<ContextSelector />}
    modelControl={<ModelSelector />}
  />
  <SettingsPanel />
</PanelShell>
```

UI rules:

- Feature UI receives projected state and callbacks.
- Feature UI does not call `chatClient` or `hostBridge` directly.
- Shared UI primitives do not know product concepts.
- Shared AI components do not know product concepts.
- Feature UI adapts entity/feature projections into generic `shared/ai` props.
- Icon buttons are local icon components plus accessible labels/tooltips.
- Text-only send button is an interim state; final send is icon-first.

## 10. Styling

The widget exports its CSS:

```json
{
  "./styles.css": "./src/styles.css"
}
```

Styling rules:

- Tailwind 4 is the styling engine.
- Use `shared/lib/cn` for class merging.
- Use Base UI for behavior-heavy primitives where helpful.
- Use CVA only for repeated variants.
- No external UI kit package imports.
- No nested cards for page sections.
- Fixed-format controls must have stable dimensions.
- Desktop and mobile text must not clip or overlap.

## 11. Harness

The harness remains outside the widget package and consumes only public APIs.

Required modes:

- `mock-stream`;
- `local-service` with fake provider;
- `local-service` with real provider credentials.

Required scenario fixtures:

- empty idle;
- streaming answer;
- completed answer with sources;
- protocol error;
- tool running/completed/failed;
- host command pending/applied/failed;
- model list available/unavailable;
- context sources available/unavailable;
- mobile viewport.

The harness may configure scenarios through query params. It must not import
feature internals.

## 12. Testing

Unit tests:

- entity projections;
- feature reducers;
- quick action resolver;
- composer submit rules;
- model/context selectors.

Integration tests:

- `SideChatWidget` submits through a mock `ChatClient`;
- host command flow dispatches through `HostBridge`;
- quick actions produce expected prompt or command intents;
- public props remain plain TypeScript/React-friendly.

Browser tests:

- desktop styled panel smoke;
- mobile styled panel smoke;
- local-service stream smoke;
- no console warnings/errors;
- no overlapping/clipped controls in primary viewports.

Governance:

- no forbidden UI package imports;
- no deep package boundary imports;
- `scripts/check-widget-layers.mjs` enforces
  `app -> features -> entities -> shared`, same-feature-only feature imports,
  no obsolete widget folders, and no fake scaffold text;
- `scripts/check-governance-fixtures.mjs` must include a negative fixture for
  widget layer violations;
- no AI SDK/provider/runtime leaks into widget/client public APIs;
- `npm run verify` passes under pinned Node/npm.

## 13. Current Gaps

The first structural migration is implemented, but the widget is still not the
final product UI.

Known gaps:

- settings panel is missing;
- resize handles are missing;
- new-chat does not reset local conversation state yet;
- quick actions are prop-driven prompt intents, but there is no product catalog
  yet;
- source chips are omitted until real citation/source data exists;
- context and model toolbar labels render only when real labels are supplied;
- model/context selectors are missing;
- send button is text-first;
- markdown/code/list rendering is missing;
- mobile browser smoke is missing.

## 14. Migration Plan

1. `[Done]` Create `shared/lib`, `shared/assets`, and the local shadcn-style primitive
   library under `shared/ui`.
2. `[Done]` Localize the approved Vercel AI Elements-style patterns under `shared/ai`,
   depending only on `shared/ui`, `shared/lib`, local assets/icons, React,
   Tailwind 4, and the approved primitive dependencies.
3. `[Done]` Create feature UI adapters that map entity/feature state into generic
   `shared/ai` props.
4. `[Partial]` Create `entities` projections for message, tool, and host
   command. Source, model option, and host context entities wait for real data
   contracts.
5. `[Done]` Move conversation reducer/rendering into `features/conversation`.
6. `[Done]` Move composer state/rendering into `features/composer`.
7. `[Done]` Move panel shell/header/state into `features/panel`.
8. Add `features/context-scope` and `features/model-selection`.
9. `[Partial]` Add `features/quick-actions` and wire prompt actions to submit;
   host-command quick actions wait for typed command intents.
10. `[Done]` Split `app` into public component, controller, pure view, and
    flows.
11. Expand harness scenarios.
12. Add desktop/mobile Playwright smoke checks.
13. Run pinned `npm run verify` and update this gap register.

## 15. Acceptance Criteria

The trimmed FSD migration is acceptable when:

- source imports obey `app -> features -> entities -> shared`;
- local shadcn-style primitives are present as owned source in `shared/ui`;
- approved Vercel AI Elements-style patterns are present as owned source in
  `shared/ai`;
- `shared/ai` depends on `shared/ui`, never on shadcn packages, AI Elements
  packages, AI SDK UI types, protocol DTOs, or product feature state;
- the widget still exports only public package APIs;
- every visible control has behavior or an honest disabled state;
- all protocol event types render through entity/feature projections;
- quick actions and source chips are interactive through typed intents;
- model/context controls use real state, not hardcoded labels;
- desktop and mobile browser smoke tests pass;
- local-service mode streams through the service path;
- pinned `npm run verify` passes;
- no forbidden UI kit, provider, runtime, DB, or service imports exist in widget
  source.

## 16. Open Questions

- Should model metadata be passed as props first, or loaded by a browser-safe
  client method?
- Should close/minimize be widget-local state or host-controlled through
  `onPanelAction`?
- Should context usage percent be host-provided, service-provided, or omitted
  until reliable?
- Which quick actions are prompt-only and which require host commands?
- Should markdown rendering be implemented locally now, or should protocol grow
  structured answer parts first?
