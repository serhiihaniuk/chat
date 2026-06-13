# shared/ai

Read this when: you are tempted to edit or imitate files under `shared/ai`.
Source of truth for: copied/vendor-style status of this folder.
Not source of truth for: Side Chat widget architecture or project UI style.

This folder contains copied visual primitives from an external AI UI component
style. Treat it as quarantined copied code.

## Allowed

- Visual primitive maintenance needed to keep the widget compiling.
- Small compatibility edits required by React, TypeScript, or package updates.
- Imports from local shared visual utilities when they do not introduce product
  behavior.

## Not Allowed

- Side Chat business logic.
- Protocol event mapping.
- Runtime, provider, tool, or Effect workflow knowledge.
- Persistence, auth, service, or host-command behavior.
- New project-owned patterns that other layers should copy.

Project behavior belongs in `widgets`, `features`, or `entities`. Project-owned
reusable primitives belong in `shared/ui` or `shared/lib`.
