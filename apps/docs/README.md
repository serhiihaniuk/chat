# Side Chat design-token configurator

Read this when: running or changing the local design-system configurator.
Source of truth for: the docs app's ownership, source layout, and local commands.
Not source of truth for: production widget values or package boundaries; those live in
[`packages/side-chat-widget/styles.css`](../../packages/side-chat-widget/styles.css)
and [`docs/architecture/package-boundaries.md`](../../docs/architecture/package-boundaries.md).

## Purpose

The docs app opens in a designer-first visual editor with color controls, size
sliders, foundation categories, theme switching, and real widget scenarios. An
advanced CSS-token view keeps every discovered custom property searchable,
editable, resettable, and exportable without overwhelming the default workflow.

The catalog derives from the stylesheet. Do not add a parallel token registry.
Token names and defaults remain owned by `packages/side-chat-widget/styles.css`.

## Boundary

The app imports only public widget exports and the exported stylesheet. It does not
call Side Chat HTTP routes, read environment credentials, import service modules, or
persist product data. Preview overrides remain in memory and exported JSON reaches
the clipboard only after a user action.

The preview mounts in a Shadow DOM so widget Tailwind tokens and resets cannot alter
the docs chrome. Popup portals remain inside `SideChatWidgetRoot`, which keeps theme
and font inheritance intact.

## Source layout

- `src/token-catalog.ts` discovers and groups stylesheet custom properties.
- `src/configurator/` owns search, filtering, editing, reset, and export behavior.
- `src/preview/` owns Shadow DOM setup and real widget preview scenarios.
- `src/app.css` owns the docs chrome; widget visuals stay in the widget stylesheet.

## Commands

Run commands from the repository root:

```sh
npm run dev:docs
npm test -- apps/docs/src
npm run build --workspace @side-chat/docs
```

The development server uses `http://127.0.0.1:5174` with `strictPort`.
