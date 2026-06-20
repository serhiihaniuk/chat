# Side Chat Documentation

Read this when: you need the reading path for Side Chat docs.
Source of truth for: documentation order and document ownership.
Not source of truth for: domain term definitions or implementation details.

## Reading Paths

| Task                                                          | Read                                            |
| ------------------------------------------------------------- | ----------------------------------------------- |
| Learn the product shape                                       | `architecture/system-map.md`                    |
| Edit domain terms                                             | `domain/vocabulary.md`                          |
| Change stream-chat lifecycle                                  | `architecture/assistant-turn.md`                |
| Add tools, guards, executors, observability, or host commands | `architecture/extension-seams.md`               |
| Change package imports or data boundaries                     | `architecture/package-boundaries.md`            |
| Change runtime, protocol, events, or Effect/Stream code       | `architecture/runtime-and-protocol-events.md`   |
| Change widget, host bridge, or copied UI primitives           | `architecture/widget-and-host-integration.md`   |
| Embed the widget iframe in a host app                         | `operations/embed-widget-iframe.md`             |
| Review product or quality requirements                        | `product/requirements.md`                       |
| Plan human-readable service config migration                  | `product/human-readable-service-config-plan.md` |
| Choose verification commands                                  | `operations/verification.md`                    |

## Durable Docs

| File                                            | Owns                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `domain/vocabulary.md`                          | Canonical terms and names to avoid.                                                   |
| `architecture/system-map.md`                    | Product identity, package roles, and first files.                                     |
| `architecture/assistant-turn.md`                | Assistant turn lifecycle and failure split.                                           |
| `architecture/extension-seams.md`               | Adoption seams and contract locations.                                                |
| `architecture/package-boundaries.md`            | Import/data boundaries and common mistakes.                                           |
| `architecture/runtime-and-protocol-events.md`   | Runtime/provider/protocol event separation and stream style.                          |
| `architecture/widget-and-host-integration.md`   | Widget layers, host bridge, and copied UI quarantine.                                 |
| `operations/embed-widget-iframe.md`             | Local iframe embedding, no-Docker launcher, and Workbench ports.                      |
| `product/requirements.md`                       | Functional, quality, safety, and adoption requirements.                               |
| `product/human-readable-service-config-plan.md` | Staged plan for moving scattered service config into one typed human-readable config. |
| `product/todo.md`                               | Deferred product work that should not appear as active config.                        |
| `operations/verification.md`                    | Local gates, scenario lanes, and reporting.                                           |
| `adr/*.md`                                      | Accepted decisions and why.                                                           |

Package READMEs are local orientation cards. They may link to canonical docs,
but they do not define global vocabulary or repeat architecture chapters.
