---
name: side-chat-documentation
description: Write, review, update, or audit documentation — READMEs, architecture and design notes, ADRs, guides, doc comments, API/protocol docs, and changelogs — so it is clear AND accurate. Combines Google technical-writing craft (audience-first; active voice; strong verbs; short single-idea sentences; parallel lists; scannable paragraphs with strong opening sentences; explicit terms; clear document structure) with Side Chat's accuracy rules (docs must match current code; canonical docs own their topic; link vocabulary instead of duplicating it; delete stale plan/target docs). Use for documentation passes and audits, stale-doc detection, README/architecture cleanup, doc-writing help, or whenever a code change affects docs.
compatibility: Codex CLI, Codex IDE extension, Codex app; instruction-first skill, no network required (Google Technical Writing One/Two distilled into references/).
metadata:
  version: "1.0.0"
  project: "Side Chat"
  domain: "Technical documentation — READMEs, architecture docs, ADRs, guides, doc comments, protocol/API docs"
  source: "Google Technical Writing One & Two (developers.google.com/tech-writing) adapted to the Side Chat repository conventions."
---

# Side Chat Documentation

Write docs a maintainer can use without already knowing the system. Two things make
a doc good, and a doc must pass both:

1. **Accurate** — it matches the current code, terms, and lifecycle.
2. **Clear** — a busy reader gets the answer fast, in plain, scannable prose.

A beautifully written doc that lies is worse than no doc. An accurate doc that
reads like an AI essay wastes the reader's time. Hold both.

## When to use this skill

Use it when the task is documentation: writing or updating a README, architecture
or design note, ADR, guide, runbook, protocol/API doc, or a non-trivial doc
comment; doing a documentation pass or audit; hunting stale docs; or cleaning up
prose. Also use it before finalizing any code change that alters a documented
term, lifecycle, boundary, command, or public contract — update the doc in the
same change.

For code readability, comments, and quality gates, use `side-chat-code-quality-gate`.
For test design, use `side-chat-testing-architecture`. This skill owns durable
prose docs.

## The one equation

> good docs = (knowledge the audience needs for the task) − (what they already know)

Before writing or reviewing, answer four questions:

1. Who is the reader? (role + how close they already are to this topic)
2. What is their goal — why are they here?
3. What do they already know?
4. What must they know or do after reading?

Give them exactly that. Cut what they know; add what they lack. The most common
failure is the **curse of knowledge**: the author forgets what a newcomer doesn't
know and leaves a "file not found" gap.

## Ground every doc in the real system first

Docs go stale silently. Before writing or judging a doc, read the code and the
canonical docs it describes — never document from memory or from an older doc.

- Confirm names, signatures, endpoints, events, and lifecycle order against source.
- Read the canonical docs that own the topic (below) so you link instead of
  re-deriving.
- If the code and the doc disagree, the code is the truth; fix the doc.

## Craft rules (the short version)

Full rules with examples: `references/google-tech-writing-rules.md`. The essentials:

- **Words.** Define unfamiliar terms on first use (or link). Use one name per
  concept — never drift between synonyms. Spell out an acronym on first use; only
  define one that is much shorter AND used many times. Replace ambiguous `it` /
  `this` / `that` with the explicit noun.
- **Active voice.** Actor + verb + target. "The reaper terminalizes the turn", not
  "The turn is terminalized by the reaper." Imperative ("Run the migration.") is
  active and right for steps.
- **Strong verbs.** Replace *is/are/occurs/happens* with what actually happens.
  Cut `there is` / `there are`. Replace vague adjectives with data.
- **Short sentences.** One idea each. Split chains joined by *and/because/which*.
  Delete filler ("in order to" → "to", "is able to" → "can").
- **Lists & tables.** Bulleted = unordered, numbered = ordered steps (start each
  step with an imperative verb). Keep items parallel. Introduce every list/table
  with a sentence ending in a colon. Convert run-in lists to real lists.
- **Paragraphs.** Lead with the point — the opening sentence is the one many
  readers read. One topic per paragraph, ~3–5 sentences. Answer What, Why, How.
- **Structure.** State scope (and pointed non-scope), audience, and prerequisites
  up front. Summarize key points first — readers may not reach page two. Organize
  by the reader's goal. Compare new things to familiar ones.

## Side Chat accuracy and ownership rules

Canonical docs own their topic; everything else links to them. Do not redefine a
canonical topic in a second place — duplication is how docs drift.

- `docs/domain/vocabulary.md` — owns terms. READMEs link here; they don't redefine
  global vocabulary.
- `docs/architecture/assistant-turn.md` — owns the turn lifecycle and its order.
- `docs/architecture/system-map.md` — owns package roles and entry files.
- `docs/architecture/package-boundaries.md` — owns import/data boundaries.
- `docs/architecture/runtime-and-protocol-events.md` — owns runtime + `sidechat.v1`
  events and the streaming/transport contract.
- `docs/operations/verification.md` — owns gate commands.
- Package `README.md` — owns that package's local role and entry points, and links
  out for shared vocabulary, lifecycle, and boundaries.

Flag or fix a doc when it:

- describes code that no longer exists, or misnames an endpoint, event, term, or
  command (e.g. an old single streaming endpoint after a two-call flow shipped);
- claims production behavior the system does not have;
- is an old target / current-state / implementation-plan doc still linked as
  truth — delete it or move it to an explicit planning area, in the same change
  that supersedes it;
- redefines vocabulary that `docs/domain/vocabulary.md` already owns;
- reads like an essay instead of a scannable reference;
- documents a new capability nowhere (a shipped feature with no doc + no ADR when
  the decision was architectural).

This repo is pre-production: prefer a clean final-state rewrite over compatibility
notes and change-history asides. Do not keep a replaced doc "for history".

## Doing a documentation pass

When asked to review or update docs broadly:

1. **Inventory** the docs (`git ls-files '*.md'`, package READMEs, root plans) and
   group them: canonical architecture, package READMEs, ADRs, product/ops, process
   /skills.
2. **List what changed** in the code recently (new endpoints, events, lifecycle,
   terms, commands, removed APIs). That list is your staleness checklist.
3. **Audit each doc against the code**, not against other docs. For broad scope,
   fan out one reviewer per cluster; have each read its docs AND the relevant
   source and report per file: `current` / `stale (specifics + file:line)` /
   `gap`.
4. **Triage:** fix high-confidence accuracy errors and clear craft problems;
   surface uncertain or larger restructurings as findings for the user.
5. **Edit** with the craft rules above. Keep the diff scoped; don't rewrite a doc
   that is merely outdated in one section.
6. **Self-edit** every doc you touch (next section).
7. **Verify** any command, code sample, endpoint, or term you wrote or changed —
   run it or grep the source. Never ship an unverified sample.

## Self-edit before finalizing

Run this pass on every doc you write or change:

1. Set it aside, then re-read as the target reader. Read tricky parts aloud.
2. Does the opening state scope, audience, and the key point?
3. Is every term, name, endpoint, event, and command correct against the code?
4. Cut: weak verbs, passive voice, `there is`, vague modifiers, filler, ambiguous
   pronouns, walls of text, run-in lists.
5. Are lists parallel and introduced? Are steps imperative and ordered?
6. Could a lower-context maintainer act on this without opening five other docs?
7. Did you delete or relink anything this change made stale?

## Review-mode output

When reviewing without editing, report actionable findings only:

```md
## Summary
<Docs inspected, how checked (against which source), dominant risk: accuracy vs clarity.>

## Findings
| Severity | Category | Doc (file:line) | Problem | Fix | Confidence |
|---|---|---|---|---|---|
| high | stale-accuracy | docs/architecture/assistant-turn.md:40 | Describes removed POST /chat/stream; flow is now two-call. | Rewrite lifecycle to POST /chat/runs + GET /chat/turns/:id/stream. | high |
| med | clarity-structure | packages/db/README.md:12 | Wall-of-text intro, passive voice. | Lead with the package's role; split into a 4-sentence opener + list. | med |

## Gaps
<Shipped features or decisions with no doc/ADR.>

## Uncertainty
<Docs not checked, or where code intent was unclear.>
```

Categories: `stale-accuracy`, `missing-doc`, `vocabulary-duplication`,
`clarity-structure`, `clarity-sentence`, `list-table`, `audience-mismatch`,
`scope-creep`, `dead-doc` (stale plan/target still linked as truth).

## When to read the reference

Read `references/google-tech-writing-rules.md` for the full do/don't rules with
examples (words, voice, sentences, lists/tables, paragraphs, audience, structure,
self-editing, doc types, illustrating, sample code) — before a large writing or
audit pass, or whenever you need the precise rule and example behind a finding.
