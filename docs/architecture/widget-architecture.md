# Widget Architecture

Read this when: you edit the React widget, browser-visible UI behavior, or
copied visual primitives.
Source of truth for: widget layers and `shared/ai/**` quarantine.
Not source of truth for: backend workflow or protocol term definitions.

## Layer Shape

```txt
app
widgets/<slice>
features/<slice>
entities/<slice>
shared/ui
shared/lib
shared/ai
```

| Layer                   | Owns                                                     |
| ----------------------- | -------------------------------------------------------- |
| `widgets/side-chat`     | Public composite widget and layout composition.          |
| `features/chat`         | Chat submission, stream consumption, visible turn state. |
| `features/conversation` | Conversation list/rendering behavior.                    |
| `features/panel`        | Panel open/close/resizing behavior.                      |
| `features/prompt`       | Prompt input behavior.                                   |
| `entities/chat`         | Protocol-backed message and activity state.              |
| `entities/panel`        | Panel model helpers.                                     |
| `shared/ui`             | Project-owned reusable primitives.                       |
| `shared/lib`            | Browser-safe utilities.                                  |
| `shared/ai`             | Copied/vendor-style visual primitives only.              |

## Protocol To UI State

Protocol events enter the widget through chat feature/model code. The state layer
maps source protocol event names to target widget message or activity state.
Rendering components should receive already-shaped view state.

## Copied UI Quarantine

`packages/side-chat-widget/src/shared/ai/**` contains copied visual primitives.

Rules:

- Do not use these files as examples for project code style.
- Do not add Side Chat business logic here.
- Do not add protocol mapping, runtime knowledge, persistence, auth, or Effect
  workflows here.
- Keep imports visual-only and within allowed widget shared boundaries.
- Put project behavior in `widgets`, `features`, or `entities`.

## Shared UI

`shared/ui` is project-owned and must follow repo readability rules. It can be a
catalog of primitives, but it should not own chat stream mechanics or product
workflow terms.

## Related Checks

- `scripts/check-widget-layers.mjs`
- `scripts/check-runtime-boundaries.mjs`
- `scripts/check-human-readability.mjs`
