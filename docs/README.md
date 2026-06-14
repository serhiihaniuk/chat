# Side Chat Documentation

Read this when: you need the reading path for Side Chat docs.
Source of truth for: documentation order and document ownership.
Not source of truth for: domain term definitions or implementation details.

## Reading Paths

| Task                            | Read                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Learn the product shape         | `architecture/foundation-overview.md`, then `architecture/system-overview.md`       |
| Adopt or extend Side Chat       | `architecture/adoption-extension-map.md`, then `architecture/capability-model.md`   |
| Edit domain terms               | `domain/vocabulary.md`                                                              |
| Change package boundaries       | `architecture/package-map.md`, then `architecture/boundaries.md`                    |
| Change capability policy        | `architecture/capability-model.md`, then `architecture/stream-chat-flow.md`         |
| Change retrieval/memory context | `architecture/assistant-turn-lifecycle.md`, then `architecture/stream-chat-flow.md` |
| Change stream-chat behavior     | `architecture/assistant-turn-lifecycle.md`, then `architecture/stream-chat-flow.md` |
| Change Effect workflows         | `architecture/effect-style.md`                                                      |
| Change widget code              | `architecture/widget-architecture.md`                                               |
| Change tests or gates           | `architecture/testing-and-verification.md`                                          |
| Review product scope            | `product/functional-requirements.md`                                                |
| Review quality requirements     | `product/non-functional-requirements.md`                                            |

## Durable Docs

| File                                       | Owns                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| `domain/vocabulary.md`                     | Canonical terms, aliases, and forbidden aliases.             |
| `domain/lifecycle.md`                      | Assistant turn, stream, tool, and terminal order.            |
| `product/functional-requirements.md`       | Final intended product behavior.                             |
| `product/non-functional-requirements.md`   | Quality, safety, readability, and verification requirements. |
| `architecture/foundation-overview.md`      | Product identity and adoption shape.                         |
| `architecture/adoption-extension-map.md`   | First files and folders for adopter extension seams.         |
| `architecture/capability-model.md`         | Manifest, executable registry, and turn-policy separation.   |
| `architecture/system-overview.md`          | One-screen system map.                                       |
| `architecture/package-map.md`              | Package ownership and public surfaces.                       |
| `architecture/boundaries.md`               | What must not cross each seam.                               |
| `architecture/assistant-turn-lifecycle.md` | Current and target assistant turn lifecycle order.           |
| `architecture/stream-chat-flow.md`         | Main assistant turn stages.                                  |
| `architecture/effect-style.md`             | Local Effect usage rules.                                    |
| `architecture/widget-architecture.md`      | Widget layers and copied UI quarantine.                      |
| `architecture/testing-and-verification.md` | Commands and what each lane proves.                          |
| `adr/*.md`                                 | Accepted decisions and why.                                  |

Package READMEs are local orientation cards. They may link to vocabulary terms,
but they do not define global vocabulary.
