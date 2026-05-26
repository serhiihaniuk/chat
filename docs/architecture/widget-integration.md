# Widget Integration

Technical UI system design for the widget lives in
`docs/architecture/widget-ui-system-design.md`. This integration document owns
package boundaries; the widget UI system design owns the trimmed FSD package
shape, component architecture, state, data flow, interactions, and browser
acceptance requirements.

The widget is owned source under `packages/side-chat-widget` and now follows the
trimmed FSD shape documented above:

- `widgets/side-chat/` owns the public composite widget API and top-level
  composition.
- `features/` owns user-facing capabilities such as conversation, composer,
  panel, quick actions, model selection, and context scope.
- `entities/` owns protocol-backed product nouns and projections.
- `shared/ui/` owns copied/adapted shadcn-style primitives as a local component
  library.
- `shared/ai/` owns copied/adapted Vercel AI Elements-style chat components as
  a local component library.
- `shared/lib/` owns local helpers. Icon usage currently comes from the accepted
  `lucide-react` widget dependency instead of a local `shared/assets` folder.

The UI dependency ladder is:

```txt
approved packages -> shared/ui -> shared/ai -> features -> widgets
```

Entities may import protocol types and `shared/lib` helpers, but they must not
import React UI or `shared/ai` components.

`shared/ui` may start from shadcn-style source, but it must not depend on a
shadcn package or generated registry. It may depend on React, Tailwind 4,
`@base-ui/react`, local `cn`, and accepted widget UI dependencies where the
component needs them.

`shared/ai` is the widget-local AI component layer. Selected component source is
vendored/adapted under `shared/ai` so consumers do not run generators. It
composes `shared/ui` and receives generic props. Feature UI maps widget
projections and state into those generic props.

The widget imports only browser-safe packages and public package entrypoints. It
has no dependency on partner AI core, agent runtime, DB, Hono, Drizzle, Effect,
provider SDKs, or forbidden shadcn registry packages.

The current user-facing widget includes a resizable panel, conversation stream,
canonical assistant activity timeline, backend tool rows, source/citation
surfaces, prompt input, context control, model picker inside the prompt input
area, and host-command activity UI.

Assistant activity is one ordered projection owned by `entities/chat`. Feature
UI renders that projection through generic `shared/ai` components. The widget
stores typed reasoning, progress, tool, and host-command activity in that single
projection and does not infer tool progress from display text.
