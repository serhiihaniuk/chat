# shared/ai

Read this when: you are tempted to add AI-chat visual primitives under `shared/ai`.
Source of truth for: why this folder is intentionally narrow.
Not source of truth for: Side Chat widget architecture or project UI style.

This folder now contains only the Markdown/Streamdown wrapper used by assistant
messages. The copied visual primitives that used to live here were retired when
the widget moved to project-owned components under `shared/ui`.

`MarkdownContent` alone owns the `.sc-markdown` hook. The package stylesheet
styles Streamdown's generated DOM through documented `--message-*` component
tokens; callers provide only layout and reading-measure classes.

## Allowed

- Markdown/Streamdown wrapper maintenance.
- Parser, sanitization, link, and incomplete-stream rendering configuration.

## Not Allowed

- New message, composer, model selector, reasoning, conversation, or tool UI
  primitives.
- Side Chat business logic.
- Protocol event mapping.
- Runtime, provider, tool, or Effect workflow knowledge.
- Persistence, auth, service, or client-tool behavior.
- New project-owned patterns that other layers should copy.

Project behavior belongs in `widgets`, `features`, or `entities`. Project-owned
reusable primitives belong in `shared/ui` or `shared/lib`.
