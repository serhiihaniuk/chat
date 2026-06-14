# Widget And Host Integration

Read this when: editing the React widget, host bridge, browser harness, or
copied visual primitives.
Source of truth for: widget layers, host-command separation, and copied UI
quarantine.
Not source of truth for: backend workflow, protocol term definitions, or
provider/runtime internals.

## Widget Layers

```txt
app
widgets/<slice>
features/<slice>
entities/<slice>
shared/ui
shared/lib
shared/ai
```

| Layer                   | Owns                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `widgets/side-chat`     | Public composite widget and layout composition.            |
| `features/chat`         | Chat submission, stream consumption, visible turn state.   |
| `features/conversation` | Conversation list and message/activity rendering behavior. |
| `features/panel`        | Panel open, close, and resize behavior.                    |
| `features/prompt`       | Prompt input behavior.                                     |
| `entities/chat`         | Protocol-backed message and activity state.                |
| `entities/panel`        | Panel model helpers.                                       |
| `shared/ui`             | Project-owned reusable primitives.                         |
| `shared/lib`            | Browser-safe utilities.                                    |
| `shared/ai`             | Copied/vendor-style visual primitives only.                |

## Protocol To UI

Protocol events enter through chat feature/model code. State code maps source
SidechatStreamEvents into target widget messages and activity items. Rendering
components should receive already-shaped view state.

The widget must not import Effect, Hono, DB, provider SDKs, runtime internals, or
service implementation details.

## Host Bridge

The host bridge is the browser seam for host-provided context and host commands.
Host commands are UI/host-app interactions, not backend RuntimeTools by default.

If the same business action also needs a model-callable backend tool, implement
a separate RuntimeTool with its own manifest declaration, approval policy, and
runtime registration.

## Copied UI Quarantine

`packages/side-chat-widget/src/shared/ai/**` contains copied visual primitives.

- Do not use these files as examples for project code style.
- Do not add Side Chat business logic there.
- Do not add protocol mapping, runtime knowledge, persistence, auth, service, or
  Effect workflows there.
- Put project behavior in `widgets`, `features`, or `entities`.
- Put project-owned reusable primitives in `shared/ui` or `shared/lib`.

## Related Checks

- `scripts/check-widget-layers.mjs`
- `scripts/check-runtime-boundaries.mjs`
- `scripts/check-human-readability.mjs`
