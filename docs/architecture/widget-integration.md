# Widget Integration

Technical UI system design for the widget lives in
`docs/architecture/widget-ui-system-design.md`. This integration document owns
package boundaries; the widget UI system design owns the trimmed FSD package
shape, component architecture, state, data flow, interactions, and browser
acceptance requirements.

The widget is owned source under `packages/side-chat-widget` and is migrating to
the trimmed FSD shape documented above:

- `app/` wires client streams, host bridge inputs, flows, and top-level state
  composition.
- `features/` owns user-facing capabilities such as conversation, composer,
  panel, quick actions, model selection, and context scope.
- `entities/` owns protocol-backed product nouns and projections.
- `shared/ui/` owns copied/adapted shadcn-style primitives as a local component
  library.
- `shared/ai/` owns copied/adapted Vercel AI Elements-style chat components as
  a local component library.
- `shared/assets/` and `shared/lib/` own local icons/assets and helpers.

The UI dependency ladder is:

```txt
approved packages -> shared/ui -> shared/ai -> features -> app
```

`shared/ui` may start from copied/adapted shadcn-style source, but it must not
depend on a shadcn package or generated registry. It may depend only on React,
Tailwind 4, `@base-ui/react`, `class-variance-authority`, local `cn`, and local
assets/icons where appropriate.

`shared/ai` may start from copied/adapted Vercel AI Elements-style source, but it
must not depend on an `ai-elements` package, shadcn package, or AI SDK UI message
types. It composes `shared/ui` and receives generic props. Feature UI maps widget
projections and feature state into those generic props.

The widget imports only browser-safe packages and public package entrypoints. It
has no dependency on partner AI core, agent runtime, DB, Hono, Drizzle, Effect,
provider SDKs, or forbidden UI-kit packages.
