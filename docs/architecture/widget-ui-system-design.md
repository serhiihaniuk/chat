# Widget UI Technical System Design

Date: 2026-05-25

Status: Accepted widget architecture.

This document defines the technical UI architecture for
`packages/side-chat-widget`. It uses a trimmed Feature-Sliced Design shape that
fits this package without importing the full FSD ceremony.

This document complements `docs/architecture/production-system-design.md`, which
owns repository-wide package boundaries, protocol, service, runtime,
persistence, and governance.

## 1. Goal

The widget is a feature-complete workspace assistant surface. Its architecture
keeps the UI package:

- browser-safe;
- protocol-driven;
- host-app agnostic;
- easy to test in the harness;
- small enough that feature slices stay understandable.

## 2. Trimmed FSD Decision

Use these layers only:

```txt
widgets -> features -> entities -> shared
```

Do not use these FSD layers:

- `pages`: the package has no routes.
- `processes`: flows are small enough to live in the widget controller or
  feature `model` files.
- `app`: there is no app shell inside this package beyond the exported widget
  composite.

Layer meanings:

| Layer      | Purpose                                                                                                                                                             | May import                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `widgets`  | Public composite widget API, controller wiring, async flows, and top-level composition.                                                                             | `features`, `entities`, `shared`, public external packages. |
| `features` | User-facing capabilities: chat stream handling, conversation rendering, composer, panel controls, quick actions, context scope, model selection, and host commands. | `entities`, `shared`, public external packages.             |
| `entities` | Product nouns and protocol projections: message, assistant activity, source, host command, model option, and context snapshot.                                      | `shared/lib`, public protocol types.                        |
| `shared`   | Local component libraries, local icons/assets, generic helpers, Tailwind class helpers.                                                                             | approved public external packages only.                     |

Import direction is strict. Lower layers must not import higher layers.

## 3. Local UI Library Stack

The widget uses exact shadcn-style primitives and AI Elements-derived chat
components as first-party widget code, while retaining the accepted packages that
those components need. The dependency ladder is:

```txt
approved packages
  -> shared/lib
  -> shared/ui
  -> shared/ai
  -> features/*/ui
  -> widgets
```

Approved widget UI/runtime packages for this ladder are React, Tailwind 4,
`@base-ui/react`, `clsx`, `tailwind-merge`, `lucide-react`, `motion`, `nanoid`,
`streamdown`, the accepted Streamdown plugins, `shiki`, `embla-carousel-react`,
and `use-stick-to-bottom`. Local `shared/lib/cn` is also allowed.

Do not install or import `shadcn`, `@repo/shadcn-ui`, generated shadcn registry
packages, or Radix UI packages in the widget. Base UI is the primitive behavior
base.

### 3.1 `shared/ui`: Local Primitive Library

`shared/ui` is the local shadcn-style primitive library. Files such as
`shared/ui/button.tsx` may start from copied/adapted shadcn-style source, but
after copying they are first-party widget code.

`shared/ui` may import:

- React;
- Tailwind 4 classes;
- `@base-ui/react` primitives for behavior-heavy controls;
- `shared/lib/cn`;
- `lucide-react` icons when the component is explicitly icon-related;
- small accepted behavior dependencies such as `embla-carousel-react` for exact
  shadcn component parity.

`shared/ui` must not import:

- `shadcn`, `@repo/shadcn-ui`, or any generated shadcn registry output;
- Vercel AI Elements component source directly;
- AI SDK, provider SDK, protocol DTOs, chat client, host bridge, widget state,
  feature state, or entity projections.

Primitive owners:

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

`shared/ai` is the local AI Elements-derived component library. Files in this
folder may start from copied/adapted Vercel AI Elements source, but after
copying they are first-party widget code. These components compose `shared/ui`;
they do not replace it.

`shared/ai` may import:

- React;
- Tailwind 4 classes;
- `shared/ui` primitives;
- `shared/lib/cn`;
- local assets/icons;
- accepted AI display dependencies such as `ai`, `streamdown`, `motion`,
  `nanoid`, and `use-stick-to-bottom` when needed by the copied component
  behavior.

`shared/ai` must not import:

- `shadcn`, `@repo/shadcn-ui`, or shadcn registry output;
- provider SDKs, chat client, host bridge, widget state, feature state, or entity
  projections.

Local mapping:

| Vercel AI Elements-style pattern       | Local owner | Local component target                            | Input boundary                                  |
| -------------------------------------- | ----------- | ------------------------------------------------- | ----------------------------------------------- |
| `Conversation` / conversation viewport | `shared/ai` | `conversation.tsx`                                | Generic items/render callbacks only.            |
| `Message`                              | `shared/ai` | `message.tsx`                                     | Generic role/content props only.                |
| `Response` / rendered assistant text   | `shared/ai` | `message.tsx` / `MessageResponse`                 | Renderable text/parts, not protocol DTOs.       |
| `Reasoning`                            | `shared/ai` | `reasoning.tsx`                                   | Generic title/state/content props.              |
| `ChainOfThought` / activity timeline   | `shared/ai` | `chain-of-thought.tsx`                            | Generic timeline rows, status, sources, images. |
| `Tool` / tool part                     | `shared/ai` | `tool.tsx`                                        | Generic name/status/input/result/source props.  |
| `Image`                                | `shared/ai` | `image.tsx`                                       | Generic image data/alt/caption props.           |
| `Sources` / `Source`                   | `shared/ai` | `sources.tsx`                                     | Generic source label/href/metadata props.       |
| `PromptInput`                          | `shared/ai` | `prompt-input.tsx`                                | Plain value/change/submit/slot props.           |
| `ModelSelector`                        | `shared/ai` | `model-selector.tsx`                              | Generic model options/selection props.          |
| `InlineCitation`                       | `shared/ai` | `inline-citation.tsx`                             | Generic citation label/href props.              |
| `Suggestion`                           | `shared/ai` | `suggestion.tsx`                                  | Generic suggestion action props.                |
| Loading affordances                    | `shared/ui` | `spinner.tsx`; composed by `shared/ai` as needed. | Generic pending state only.                     |

Feature UI owns the product adapter layer. For example,
`features/conversation/ui/widget-message-view.tsx` maps message and canonical
assistant activity projections into generic `shared/ai` props, while
`features/prompt/ui/widget-footer.tsx` maps composer state, context controls,
model controls, and submit intents into `shared/ai/prompt-input.tsx`.

`MessageResponse` is the only renderer for AI-authored prose. Final assistant
answer deltas, safe activity descriptions, tool summaries, and human-readable
tool detail strings render through the local AI Elements-derived
`MessageResponse`, which wraps Streamdown with the accepted Streamdown plugins.
The widget stylesheet includes the Streamdown and plugin Tailwind `@source`
paths plus `streamdown/styles.css`; without those sources, parsed markdown lists
can degrade visually into unbulleted text after Tailwind preflight. Feature UI
must not flatten AI-authored strings with custom markdown-ish formatters before
rendering.

The AI Elements-derived chain-of-thought components are presentational. Product
code maps canonical activity into this shape:

- the outer Thinking section composes `Reasoning` with `ChainOfThought`;
- each activity item maps to a `ChainOfThoughtStep`;
- `running` maps to the component's active visual state;
- `completed` maps to the component's complete visual state;
- `failed` maps to the component's error/destructive visual state;
- search/source attachments map to `ChainOfThoughtSearchResults` and
  `ChainOfThoughtSearchResult`;
- image attachments map to `ChainOfThoughtImage` plus the generic `Image`
  component;
- tool activity rows may use `ChainOfThoughtStep` for the timeline shell while
  composing `Tool` content inside the open-by-default details region.

Even though the component is named `ChainOfThought`, it must only receive
product-safe activity summaries. Raw chain-of-thought, provider-native stream
parts, and AI SDK UI messages never enter widget state.

## 4. Source Layout Contract

Widget source uses FSD layers with public slice APIs:

```txt
packages/side-chat-widget/src/
  index.ts
  styles.css

  widgets/
    side-chat/
      index.ts
      model/
        side-chat-widget.types.ts
      ui/
        side-chat-widget.tsx

  features/
    chat/
      index.ts
      model/
        use-widget-chat.ts
    conversation/
      index.ts
      ui/
        widget-conversation.tsx
        widget-message-view.tsx
    panel/
      index.ts
      model/
        widget-resize.ts
      ui/
        widget-frame.tsx
    prompt/
      index.ts
      ui/
        widget-context.tsx
        widget-footer.tsx

  entities/
    chat/
      index.ts
      model/
        activity.ts
        widget-chat.ts
    panel/
      index.ts
      model/
        panel.ts

  shared/
    ui/
      button.tsx
      badge.tsx
      button-group.tsx
      carousel.tsx
      collapsible.tsx
      command.tsx
      dialog.tsx
      dropdown-menu.tsx
      hover-card.tsx
      input.tsx
      input-group.tsx
      scroll-area.tsx
      select.tsx
      separator.tsx
      textarea.tsx
      tooltip.tsx
      spinner.tsx
    ai/
      code-block.tsx
      chain-of-thought.tsx
      conversation.tsx
      image.tsx
      inline-citation.tsx
      message.tsx
      model-selector.tsx
      prompt-input.tsx
      reasoning.tsx
      shimmer.tsx
      sources.tsx
      suggestion.tsx
      tool.tsx
    lib/
      cn.ts
      unknown-record.ts
```

The repository enforces this layout:

- widget source uses `widgets/features/entities/shared`, not
  `application/domain/ui`;
- `src/index.ts` exports only the `widgets/side-chat` public API;
- widgets import feature/entity public APIs through `#features/*` and
  `#entities/*`, avoiding same-layer cross-imports;
- feature UI maps widget state into generic `shared/ai` components;
- `shared/ai` and `shared/ui` do not import product packages or feature state;
- fake scaffold labels such as static context percentages, fake model names, and
  static source chips are blocked.
- app composition is split into the public component, chat hook, frame,
  conversation, footer, message view, resize, context, and state modules.

## 5. Public API

`src/index.ts` is the package public boundary.

Public props:

```ts
export type SideChatWidgetProps = {
  readonly client: ChatClient;
  readonly hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand">;
  readonly initialState?: SideChatWidgetStateSnapshot;
  readonly labels?: SideChatWidgetLabels;
  readonly panelActions?: SideChatWidgetPanelActions;
  readonly quickActions?: readonly SideChatWidgetQuickAction[];
  readonly requestFactory?: (message: string, hostContext?: HostContext) => ChatStreamRequest;
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
- Model options and context controls are rendered inside the prompt input area
  when real props/context are available.

## 6. State Ownership

Top-level state is composed in `widgets/side-chat`.

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
- `sidechat.activity`;
- `sidechat.completed`;
- `sidechat.error`;
- `sidechat.history`.

Conversation feature should not render raw protocol events directly. It should
render projections built from `entities/*`.

### Assistant Activity

Owns:

- one ordered activity list per assistant turn;
- stable activity ids and insertion order;
- current active activity id;
- activity lifecycle: running, completed, failed;
- progress and safe reasoning summary rows;
- tool activity rows with expandable parameters, result, error, and sources;
- search/source attachments and image attachments on activity rows;
- host-command activity rows with command payload, dispatch state, and host
  result;
- activity section timing used by the Thinking / Thought for N seconds trigger.

Activity state is canonical. The widget maintains one ordered activity
projection with typed reasoning, progress, tool, and host-command items. Render
code receives that projection directly and does not sort, regroup, or infer tool
progress from row text.

Rules:

- insert activity rows in protocol sequence order;
- do not change an activity row's `sequence` or main title after insertion;
- keep tool details inside the expandable tool row;
- only `activeActivityId` renders as running;
- completing a row may update status and hidden details, but must not reorder the
  row or make older rows appear newly active;
- final assistant text renders outside the activity section.

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

Quick actions/suggestions are supplied through props or harness scenarios. Do not
hardcode fake product actions in the widget.

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

| Entity         | Owns                                                                       | Source inputs                                         |
| -------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `message`      | user/assistant/system message projection, markdown-ready final text parts. | `ChatStreamRequest`, `HistoryMessage`, delta events.  |
| `activity`     | ordered assistant activity timeline and activity details.                  | `sidechat.activity`, host command results.            |
| `source`       | source id, label, href, disabled/action state.                             | activity tool details, citation events, host context. |
| `model-option` | model id, label, availability display.                                     | props or model metadata client.                       |
| `host-context` | page/workspace/selection context display.                                  | `hostBridge.getContext`.                              |

Entities can import protocol types and `shared` helpers. Entities cannot import
features or React UI.

## 8. Data Flow

Submit flow:

```txt
features/prompt/ui/widget-footer prompt input
  -> widgets/side-chat controller intent
  -> hostBridge.getContext()
  -> widgets/side-chat requestFactory({ message, selectedModel, context })
  -> chatClient.streamChat(request)
  -> sidechat.v1 events
  -> features/chat applies events through entities/chat reducers
  -> entities/chat message + activity projections
  -> features/conversation maps projections into shared/ai components
```

Host command flow:

```txt
sidechat.activity activityKind=host_command
  -> entities/chat activity projection
  -> features/conversation renders host-command activity row
  -> features/chat dispatches command details through hostBridge.dispatchCommand
  -> HostCommandResult
  -> entities/chat updates the same activity row details/status
  -> features/conversation keeps the row in chronological order
```

Quick action flow:

```txt
features/quick-actions UI
  -> quick-action resolver
  -> prompt intent OR host-command intent
  -> widgets/side-chat routes into submit or host command flow
```

Panel action flow:

```txt
features/panel/ui/widget-frame UI
  -> panel reducer
  -> optional widget onPanelAction callback
```

## 9. UI Composition

`widgets/side-chat/ui/side-chat-widget.tsx` composes the screen:

```tsx
<WidgetFrame>
  <WidgetConversation />
  <WidgetFooter />
</WidgetFrame>
```

UI rules:

- Widget UI receives projected state and callbacks.
- Widget render components do not call `chatClient` or `hostBridge` directly.
- Shared UI primitives do not know product concepts.
- Shared AI components do not know product concepts.
- Feature UI adapts widget projections into generic `shared/ai` props.
- Model picker and context control belong inside the prompt input surface.
- Assistant activity renders through one `Reasoning` section containing an
  ordered vertical timeline.
- Tool activity rows compose the AI component layer and remain closed by
  default.
- The panel is resizable through widget-owned geometry state.

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
- No shadcn registry package imports.
- No nested cards for page sections.
- Fixed-format controls must have stable dimensions.
- Desktop and mobile text must not clip or overlap.

## 11. Harness

The harness remains outside the widget package and consumes only public APIs.

Required modes:

- `mock-stream`;
- `local-service` with configured OpenAI/provider credentials;
- explicit fake-provider mode for deterministic service tests.

Required scenario fixtures:

- empty idle;
- streaming answer;
- completed answer with activity and sources;
- protocol error;
- ordered activity: progress -> tool -> progress -> final answer;
- tool activity running/completed/failed with closed details by default;
- host command activity pending/applied/failed;
- model list available/unavailable;
- context sources available/unavailable;
- mobile viewport.

The harness may configure scenarios through query params. It must not import
feature internals.

## 12. Testing

Unit tests:

- entity projections;
- assistant activity reducer and activity lifecycle rules;
- feature reducers;
- quick action resolver;
- composer submit rules;
- model/context selectors.

Integration tests:

- `SideChatWidget` submits through a mock `ChatClient`;
- host command flow dispatches through `HostBridge`;
- activity rows stay in protocol order while tool details update;
- quick actions produce expected prompt or command intents;
- public props remain plain TypeScript/React-friendly.

Browser tests:

- desktop styled panel smoke;
- mobile styled panel smoke;
- local-service stream smoke;
- ChatGPT-style Thinking section with chronological activity timeline;
- tool rows open by default and expandable for parameters, result, error, and
  sources;
- only the current activity row appears running;
- no console warnings/errors;
- no overlapping/clipped controls in primary viewports.

Governance:

- no forbidden UI package imports;
- no deep package boundary imports;
- `scripts/check-widget-layers.mjs` enforces
  `widgets -> features -> entities -> shared`, same-feature-only feature imports,
  no obsolete widget folders, and no fake scaffold text;
- `scripts/check-governance-fixtures.mjs` must include a negative fixture for
  widget layer violations;
- no AI SDK/provider/runtime leaks into widget/client public APIs;
- `npm run verify` passes under pinned Node/npm.

## 13. Acceptance Criteria

The widget architecture is acceptable when:

- source imports obey `widgets -> features -> entities -> shared`;
- local shadcn-style primitives are present as owned source in `shared/ui`;
- approved Vercel AI Elements-style patterns are present as owned source in
  `shared/ai`;
- `shared/ai` depends on `shared/ui` and accepted AI display dependencies, never
  on shadcn registry packages, provider SDKs, chat client, host bridge, widget state,
  or product feature state;
- the widget still exports only public package APIs;
- every visible control has behavior or an honest disabled state;
- all protocol event types render through entity/feature projections;
- assistant activity state is one canonical ordered model;
- render code does not sort, regroup, duplicate, or infer activity semantics from
  display text;
- tool details are open by default and collapse in place;
- completed activity rows do not visually reactivate or reorder;
- final assistant text renders separately from the activity section;
- quick actions/suggestions and source/citation displays are interactive through
  typed intents when real data is present;
- model/context controls use real state, not hardcoded labels;
- desktop and mobile browser smoke tests pass;
- local-service mode streams through the service path;
- pinned `npm run verify` passes;
- no forbidden UI kit, provider, runtime, DB, or service imports exist in widget
  source.
