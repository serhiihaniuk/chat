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

| Layer                   | Owns                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `widgets/side-chat`     | Public composite widget, wide/narrow layout, and view composition.    |
| `features/chat`         | Chat submission, stream consumption, visible turn state.              |
| `features/conversation` | Conversation switcher, wide-mode sidebar, empty state, and rendering. |
| `features/panel`        | Panel open, close, resize, and header chrome.                         |
| `features/prompt`       | Prompt input and composer behavior.                                   |
| `features/settings`     | In-panel settings view for theme and appearance controls.             |
| `features/theme`        | Theme and appearance state written to the widget root.                |
| `entities/conversation` | API/SSE client, run client, and conversation query repository.        |
| `entities/chat`         | Protocol-backed message and activity state.                           |
| `entities/panel`        | Panel model helpers.                                                  |
| `entities/settings`     | Settings metadata shared by features, such as reasoning visibility.   |
| `entities/theme`        | Theme metadata and ids shared by features.                            |
| `shared/ui`             | Project-owned reusable primitives.                                    |
| `shared/lib`            | Browser-safe utilities.                                               |
| `shared/ai`             | Copied/vendor-style visual primitives only.                           |

## Protocol To UI

Protocol events enter through chat feature/model code. State code maps source
SidechatStreamEvents into target widget messages and activity items. Rendering
components should receive already-shaped view state.

The widget tracks a server-owned run, not a single socket. `features/chat/model/run`
holds a module-level run store (`widget-run-store.ts`) that survives remounts and
pane switches and applies the ordered event log through a pure reducer. Because
generation is durable, `features/chat/model/reconnect` resubscribes after a drop
using the `after` cursor, and `features/chat/model/activity` consumes the
`/chat/activity` stream to drive the sidebar "generating" dots.

The widget must not import Effect, Hono, DB, provider SDKs, runtime internals, or
service implementation details.

## Theming And Layout

The widget is theme-agnostic. Every surface reads a shadcn token (`bg-card`,
`text-muted-foreground`, `border-border`, `bg-primary`, `bg-success`, the
`--sidebar*` group), the shared radius scale, the shared type scale, and the
registered shadow tokens; the widget owns no hardcoded colors, radii, text sizes,
or elevation values. Base and dark tokens live on `:root`/`.dark` in
`src/styles.css`.

Shadow tokens are registered in Tailwind's `--shadow-*` namespace. Runtime
elevation consumers use Tailwind v4's CSS-variable shorthand
(`shadow-(--shadow-card)`, `shadow-(--shadow-popover)`,
`shadow-(--shadow-panel)`) instead of the named `shadow-card` utility, because
the named utility compiles the default theme value into the rule. The shorthand
keeps panel, composer, menu, tooltip, and segmented-control elevation tied to
the root token that settings mutates.

Named themes (Graphite, Sapphire, Sage, Ocean) are extra token blocks.
`features/theme` writes `data-sidechat-theme` on the widget root element, so a
theme re-skins the root and its descendants through inheritance and never leaks
onto the host page. Graphite is the default and carries no attribute, so it
tracks the host's light/dark; Sapphire, Sage, and Ocean ship light-only. The
theme choice persists to `localStorage` under `themeStorageKey`.

`features/theme` also owns widget appearance settings on top of the named theme:
accent, corners, density, text size, typeface, and elevation. Those settings
persist under `side-chat-widget:appearance` and apply by writing
`data-sidechat-accent` plus root custom properties (`--radius`, `--space-unit`,
`--text-*`, `--font-widget`, and `--shadow-*`) onto `.side-chat-widget-root`.

The widget self-hosts the three settings typefaces under `src/fonts/`: **Plus
Jakarta Sans**, **DM Sans**, and **Instrument Sans**. Each `@font-face` uses a
relative URL so bundlers ship the fonts with the widget — no CDN, works offline.
The fonts are scoped to the widget root and its portaled popovers, so they never
override the embedding host page's own typography.

The `--font-widget` variable is scoped to the widget root and portaled popovers;
changing typeface in settings does not override the embedding host page's typography.

The panel is always a contained floating card (never full-bleed). At a width
breakpoint it reveals a persistent conversation sidebar (`--sidebar*` tokens) and
hides the header conversation switcher; below it, the header switcher returns.
Opening settings swaps the chat view inside this same panel frame rather than
mounting a second floating surface. The settings group rail shares the chat rail
width, breakpoint, and two-line row active/hover styling tokens, while narrow settings use the same main-column header. The
settings body is centered in the same `max-w-measure-message` reading column as
chat messages and the composer.

## Host Bridge

The host bridge is the browser seam for host-provided context and host commands.
Host commands are UI/host-app interactions, not backend RuntimeTools by default.

If the same business action also needs a model-callable backend tool, implement
a separate RuntimeTool with its own manifest declaration, approval policy, and
runtime registration.

For iframe embedding and the local no-Docker Workbench stack, use
`docs/operations/embed-widget-iframe.md`.

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
