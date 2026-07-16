# Side Chat Documentation

Read this when: you need to find the right Side Chat doc and know what it owns.
Source of truth for: the documentation map, reading paths, and per-doc ownership.
Not source of truth for: any domain term, lifecycle, boundary, or command (each links below).

Side Chat is an adoptable AI assistant starter: a team clones or forks this
repository, embeds the widget in its host app, and owns the resulting code. The
host keeps its business UI, auth, data, and permissions. This page is an index,
not a chapter. Pick a reading path by your skill level, then follow the ownership
table to the doc that owns each topic.

## Reading paths

**New here** — get the mental model before the code:

- [apps/docs](../apps/docs) rendered Walkthrough: a plain-English, example-first tour of how a message becomes a streamed answer.
- [architecture/system-map.md](architecture/system-map.md): the whole system on one page — product identity, package roles, first files.

**Working in the code** — change a package, lifecycle, or boundary:

- [architecture/](architecture/): system map, [assistant-turn.md](architecture/assistant-turn.md), [workflow-substrate.md](architecture/workflow-substrate.md), [client-tools.md](architecture/client-tools.md), [tool-approvals.md](architecture/tool-approvals.md), [turn-terminal-reconciliation.md](architecture/turn-terminal-reconciliation.md), [runtime-and-protocol-events.md](architecture/runtime-and-protocol-events.md), [package-boundaries.md](architecture/package-boundaries.md), [widget-and-host-integration.md](architecture/widget-and-host-integration.md), [extension-seams.md](architecture/extension-seams.md), [host-commands.md](architecture/host-commands.md), [effect.md](architecture/effect.md).
- [domain/vocabulary.md](domain/vocabulary.md): canonical terms and the synonyms to avoid.

**Adopting or operating** — turn the starter into your team's application:

- [operations/](operations/): [verification.md](operations/verification.md), [local-development.md](operations/local-development.md), [configuration.md](operations/configuration.md), [telemetry.md](operations/telemetry.md), [capacity-and-deployment.md](operations/capacity-and-deployment.md), [database.md](operations/database.md), [embed-widget-iframe.md](operations/embed-widget-iframe.md).
- [architecture/extension-seams.md](architecture/extension-seams.md): the seams for tools, guards, executors, observability, and host commands.
- [architecture/host-commands.md](architecture/host-commands.md): the end-to-end walkthrough for adding a host-side tool (host command), with a runnable example.

## Durable docs

Each file below owns its topic. Link to it; never re-derive its content elsewhere.

| File                                                                                         | Owns                                                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [domain/vocabulary.md](domain/vocabulary.md)                                                 | Canonical terms and names to avoid.                                               |
| [architecture/system-map.md](architecture/system-map.md)                                     | Product identity, package roles, first files.                                     |
| [architecture/assistant-turn.md](architecture/assistant-turn.md)                             | The assistant-turn lifecycle and its order.                                       |
| [architecture/workflow-substrate.md](architecture/workflow-substrate.md)                     | Replacement Workflow ownership, realms, journal, world, and cancellation.         |
| [architecture/client-tools.md](architecture/client-tools.md)                                 | Durable browser-executed tool dispatch and result lifecycle.                      |
| [architecture/tool-approvals.md](architecture/tool-approvals.md)                             | Durable server-tool approval decisions and execution gate.                        |
| [architecture/turn-terminal-reconciliation.md](architecture/turn-terminal-reconciliation.md) | How joined Workflow activity, product fencing, and guarded repair handle crashes. |
| [architecture/runtime-and-protocol-events.md](architecture/runtime-and-protocol-events.md)   | The three event vocabularies and the streaming transport.                         |
| [architecture/package-boundaries.md](architecture/package-boundaries.md)                     | Import and data boundaries; common boundary mistakes.                             |
| [architecture/widget-and-host-integration.md](architecture/widget-and-host-integration.md)   | Widget layers, host bridge, copied UI quarantine.                                 |
| [architecture/extension-seams.md](architecture/extension-seams.md)                           | Adoption seams and contract locations.                                            |
| [architecture/host-commands.md](architecture/host-commands.md)                               | Declaring, handling, and testing a host command end to end.                       |
| [architecture/effect.md](architecture/effect.md)                                             | Where Effect lives, what each role must know, house style, traps.                 |
| [architecture/runtime-port.md](architecture/runtime-port.md)                                 | The `AiRuntimePort` contract, integration levels, remote-engine adapter pattern.  |
| [operations/verification.md](operations/verification.md)                                     | Gate commands and what each proves.                                               |
| [operations/local-development.md](operations/local-development.md)                           | Running the service and harnesses locally.                                        |
| [operations/configuration.md](operations/configuration.md)                                   | The typed `sidechat.config.ts` and its tunables.                                  |
| [operations/telemetry.md](operations/telemetry.md)                                           | Signal meanings, bounded labels, privacy, and exporter posture.                   |
| [operations/capacity-and-deployment.md](operations/capacity-and-deployment.md)               | Instance model, SSE budgets, and what grows forever.                              |
| [operations/database.md](operations/database.md)                                             | Schema tooling, migrations, and role grants.                                      |
| [operations/embed-widget-iframe.md](operations/embed-widget-iframe.md)                       | Embedding the widget in a host page via iframe.                                   |
| [product/requirements.md](product/requirements.md)                                           | Functional, quality, safety, and adoption requirements.                           |
| [product/todo.md](product/todo.md)                                                           | Deferred product work, kept out of active config.                                 |
| [adr/](adr/)                                                                                 | Accepted architecture decisions and their rationale.                              |

Package READMEs are local orientation cards: each links here for shared
vocabulary, lifecycle, and boundaries, and never owns global terms.

## Rendered site

[apps/docs](../apps/docs) renders the docs as a site (`npm run dev` on port 4111)
with sections for the Design System (live widget components), System Design
(architecture and the turn model), the Walkthrough (the example-first tour), and
the Vocabulary. Start newcomers on the Walkthrough. The rendered System Design
and Walkthrough follow the same connection-bound streaming model as these
canonical docs: live events stay in the owning instance's registry, while
terminal status and history are durable.
