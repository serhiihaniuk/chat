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

| Layer                   | Owns                                                                 |
| ----------------------- | ------------------------------------------------------------------- |
| `widgets/side-chat`     | Public composite widget, wide/narrow layout, and view composition.  |
| `features/chat`         | Chat submission, stream consumption, visible turn state.            |
| `features/conversation` | Conversation switcher, wide-mode sidebar, empty state, and rendering. |
| `features/panel`        | Panel open, close, resize, and header chrome.                       |
| `features/prompt`       | Prompt input and composer behavior.                                 |
| `features/settings`     | Settings view overlay (theme picker today).                         |
| `features/theme`        | Theme selection state and widget-root theme attribute.              |
| `entities/chat`         | Protocol-backed message and activity state.                         |
| `entities/panel`        | Panel model helpers.                                                 |
| `entities/theme`        | Theme metadata and ids shared by features.                          |
| `shared/ui`             | Project-owned reusable primitives.                                  |
| `shared/lib`            | Browser-safe utilities.                                             |
| `shared/ai`             | Copied/vendor-style visual primitives only.                         |

## Protocol To UI

Protocol events enter through chat feature/model code. State code maps source
SidechatStreamEvents into target widget messages and activity items. Rendering
components should receive already-shaped view state.

The widget must not import Effect, Hono, DB, provider SDKs, runtime internals, or
service implementation details.

## Theming And Layout

The widget is theme-agnostic. Every surface reads a shadcn token (`bg-card`,
`text-muted-foreground`, `border-border`, `bg-primary`, `bg-success`, the
`--sidebar*` group) and a single `--radius` scale; the widget owns no hardcoded
colors or radii. Base and dark tokens live on `:root`/`.dark` in `src/styles.css`.

Named themes (Graphite, Sage, Ocean) are extra token blocks. `features/theme`
writes `data-sidechat-theme` on the widget root element, so a theme re-skins the
root and its descendants through inheritance and never leaks onto the host page.
Graphite is the default and carries no attribute, so it tracks the host's
light/dark; Sage and Ocean ship light-only. The theme choice persists to
`localStorage` under `themeStorageKey`.

The widget self-hosts **Plus Jakarta Sans** (one variable `woff2`, 200–800, under
`src/fonts/`, referenced by a relative `@font-face` URL so bundlers ship it — no CDN,
works offline). The font is scoped to the widget root and its portaled popovers, so
it never overrides the embedding host page's own typography.

The panel is always a contained floating card (never full-bleed). At a width
breakpoint it reveals a persistent conversation sidebar (`--sidebar*` tokens) and
hides the header conversation switcher; below it, the header switcher returns.

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
