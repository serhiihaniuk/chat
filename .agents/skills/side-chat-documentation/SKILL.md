---
name: side-chat-documentation
description: Write, review, update, or audit durable documentation, READMEs, architecture notes, ADRs, guides, runbooks, API docs, and non-trivial comments so they stay accurate, clear, scannable, and aligned with the current code. Use for documentation passes, stale-doc detection, source-of-truth cleanup, and documentation changes caused by code work.
compatibility: Codex CLI, Codex IDE, Codex app; instruction-first skill; no network required.
metadata:
  version: "2.0.0"
  domain: "Repository documentation accuracy, ownership, and technical writing"
  source: "Repository-local documentation guidance with general technical-writing rules"
---

# Repository Documentation

Write documentation a maintainer can use without already knowing the system. A good document must be accurate and clear. A polished document that describes removed code is worse than no document.

## When to use this skill

Use it for READMEs, architecture or design notes, ADRs, guides, runbooks, protocol or API docs, changelogs, documentation audits, stale-doc cleanup, and non-trivial documentation comments.

Use it before finalizing code that changes a documented term, lifecycle, boundary, public contract, configuration model, command, or verification rule.

Use the code-quality skill for implementation readability and quality gates. Use the testing skill when test design is the primary task.

## Ground the document in the current system

Before writing or judging a document:

1. Identify the reader, goal, prerequisites, and expected action.
2. Read the repository documentation index and the canonical document that owns the topic.
3. Read the relevant source, tests, configuration, package manifest, or command implementation.
4. Confirm names, signatures, endpoints, events, lifecycle order, paths, and commands against the current code.
5. If code and documentation disagree, report or fix the stale source of truth. Do not document from memory or from an old plan.

Use the repository's actual vocabulary. Define an unfamiliar term once or link to the glossary. Do not introduce a second name for the same concept.

## Ownership and scope

Every repository should have one source of truth for each topic. Find it before adding a new explanation:

- glossary or vocabulary document for terms;
- architecture document for package roles and boundaries;
- lifecycle or flow document for ordering and failure semantics;
- operations document for commands, configuration, deployment, and databases;
- package README for local role and entry points;
- ADR for an accepted architectural decision and its rationale.

Link to the owner instead of copying a global table into a local README. Flag documents that claim production behavior the code does not provide, keep replaced plans linked as truth, duplicate canonical vocabulary, or leave a shipped architectural capability undocumented.

Prefer the clean final state for unshipped internal changes. Delete replaced helpers, docs, comments, tests, aliases, and temporary notes when the replacement lands. Keep history only in the repository's intended history mechanism.

## Writing rules

- Lead with the document's purpose, scope, audience, and key result.
- Use active voice and strong verbs.
- Keep one idea per sentence and one topic per paragraph.
- Define unfamiliar terms near their first use.
- Use numbered lists for ordered procedures and bullets for unordered facts.
- Introduce every list or table with a sentence that explains why it exists.
- Prefer concrete values, paths, actors, and outcomes over vague adjectives.
- Remove filler, ambiguous pronouns, passive voice, walls of text, and run-in lists.
- Keep examples short and executable. Never include secrets or unverified commands.

## Documentation audit workflow

1. Inventory tracked Markdown files, package READMEs, architecture docs, operations docs, ADRs, and root-level plans.
2. List recent code changes that could make documentation stale: renamed APIs, removed files, changed events, lifecycle changes, moved ownership, new commands, or altered configuration.
3. Audit each document against source, not against another document.
4. Classify each document or section as `current`, `stale` with specific evidence, or `gap`.
5. Fix high-confidence accuracy and clarity issues. Report uncertain redesigns separately.
6. Remove or relink replaced sources of truth in the same change.
7. Verify every changed path, command, endpoint, symbol, and example.

## Self-edit before finalizing

Re-read the document as its target reader. Check:

1. Does the opening state scope, audience, and the key point?
2. Is each term, name, command, path, and lifecycle claim current?
3. Can a lower-context maintainer act without opening several unrelated documents?
4. Are lists parallel and procedures ordered?
5. Did the change leave a stale or competing source of truth behind?

## Review-mode output

When reviewing without editing, report actionable findings only:

```md
## Summary
<Documents inspected, sources checked, and dominant accuracy or clarity risk.>

## Findings
| Severity | Category | Document | Problem | Fix | Confidence |
|---|---|---|---|---|---|
| high | stale-accuracy | `path/to/document.md:line` | ... | ... | high |

## Gaps
<Shipped behavior or decision with no adequate documentation.>

## Uncertainty
<Documents or source areas not checked, or unclear intent.>
```

Useful categories include `stale-accuracy`, `missing-doc`, `vocabulary-duplication`, `clarity-structure`, `clarity-sentence`, `list-table`, `audience-mismatch`, `scope-creep`, and `dead-doc`.

## References

Read `references/google-tech-writing-rules.md` for detailed writing examples when a large documentation pass needs them.
