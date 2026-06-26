# Side Chat Documentation

Read this when: you need to find the right Side Chat doc and know what it owns.
Source of truth for: the documentation map, reading paths, and per-doc ownership.
Not source of truth for: any domain term, lifecycle, boundary, or command (each links below).

Side Chat is an embeddable, adoptable enterprise AI assistant foundation: a host
web app drops the widget into its own UI, calls the service, and keeps owning its
business UI, auth, data, and permissions. This page is an index, not a chapter. It
routes you to the doc that owns each topic and never redefines that topic here.
Pick a reading path by your skill level, then follow the ownership table.

## Reading paths

**New here** — get the mental model before the code:

- [apps/docs](../apps/docs) rendered Walkthrough: a plain-English, example-first tour of how a message becomes a streamed answer.
- [architecture/system-map.md](architecture/system-map.md): the whole system on one page — product identity, package roles, first files.

**Working in the code** — change a package, lifecycle, or boundary:

- [architecture/](architecture/): system map, [assistant-turn.md](architecture/assistant-turn.md), [runtime-and-protocol-events.md](architecture/runtime-and-protocol-events.md), [package-boundaries.md](architecture/package-boundaries.md), [widget-and-host-integration.md](architecture/widget-and-host-integration.md), [extension-seams.md](architecture/extension-seams.md).
- [domain/vocabulary.md](domain/vocabulary.md): canonical terms and the synonyms to avoid.

**Embedding or operating** — adopt, run, or extend Side Chat:

- [operations/](operations/): [verification.md](operations/verification.md), [local-development.md](operations/local-development.md), [configuration.md](operations/configuration.md), [database.md](operations/database.md), [embed-widget-iframe.md](operations/embed-widget-iframe.md).
- [architecture/extension-seams.md](architecture/extension-seams.md): the seams for tools, guards, executors, observability, and host commands.

## Durable docs

Each file below owns its topic. Link to it; never re-derive its content elsewhere.

| File | Owns |
|---|---|
| [domain/vocabulary.md](domain/vocabulary.md) | Canonical terms and names to avoid. |
| [architecture/system-map.md](architecture/system-map.md) | Product identity, package roles, first files. |
| [architecture/assistant-turn.md](architecture/assistant-turn.md) | The assistant-turn lifecycle and its order. |
| [architecture/runtime-and-protocol-events.md](architecture/runtime-and-protocol-events.md) | The three event vocabularies and the streaming transport. |
| [architecture/package-boundaries.md](architecture/package-boundaries.md) | Import and data boundaries; common boundary mistakes. |
| [architecture/widget-and-host-integration.md](architecture/widget-and-host-integration.md) | Widget layers, host bridge, copied UI quarantine. |
| [architecture/extension-seams.md](architecture/extension-seams.md) | Adoption seams and contract locations. |
| [operations/verification.md](operations/verification.md) | Gate commands and what each proves. |
| [operations/local-development.md](operations/local-development.md) | Running the service and harnesses locally. |
| [operations/configuration.md](operations/configuration.md) | The typed `sidechat.config.ts` and its tunables. |
| [operations/database.md](operations/database.md) | Schema tooling, migrations, grants, the `turn_events` log. |
| [operations/embed-widget-iframe.md](operations/embed-widget-iframe.md) | Embedding the widget in a host page via iframe. |
| [product/requirements.md](product/requirements.md) | Functional, quality, safety, and adoption requirements. |
| [product/todo.md](product/todo.md) | Deferred product work, kept out of active config. |
| [adr/](adr/) | Accepted architecture decisions and their rationale. |

Package READMEs are local orientation cards: each links here for shared
vocabulary, lifecycle, and boundaries, and never owns global terms.

## Rendered site

[apps/docs](../apps/docs) renders the docs as a site (`npm run dev` on port 4111)
with three sections: Design System (live widget components), System Design
(architecture and the resumable turn model), and Walkthrough (the example-first
tour). Start newcomers on the Walkthrough.
