# ADR 0013: The Governance Harness — AI-Built Code Under Executable Control

Status: accepted 2026-07-02 (records the practice the repo was built under)

## Context

This codebase is built with heavy AI assistance, and it is a template whose
maintainers will be lower-context than its authors. Both facts point at the
same failure mode: drift — boundaries eroding one plausible-looking change at
a time, docs quietly diverging from code, complexity creeping past what a
newcomer can hold. Human review alone does not stop drift at AI generation
speed; the review that found this repo's gaps also confirmed where the
defenses worked. The harness is a first-class architectural decision, and the
most likely future argument against it ("these lints slow us down") deserves a
recorded answer.

## What it buys here

| Capability                               | How                                                                                                                                                                                                                          | Without it                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Boundaries that hold mechanically.**   | 14 gate scripts (`npm run lint:custom`) parse every import and dependency: layer deny-lists, single-owner deps (`hono`/`pg`/`ai`/`process.env`), widget FSD ranks, outbound-call allowlists.                                 | Boundary erosion at AI speed; the architecture becomes a diagram, not a fact.        |
| **A ceiling on cleverness.**             | Cognitive-complexity and nesting budgets, file/function size caps, TypeScript assertions banned — enforced by AST, calibrated for a lower-context human, stricter for Effect/Stream/React code.                              | AI output optimized for the model's working memory instead of the next maintainer's. |
| **Docs that carry a contract.**          | Durable docs must declare `Read this when / Source of truth for / Not source of truth for`; paragraph density caps; vocabulary owned in one file; banned stale-truth docs fail the gate.                                     | The exact rot the 2026-07-01 review found in the unguarded corners.                  |
| **Gates that cannot silently die.**      | The meta-gate runs every check against a known-bad fixture and fails if any `check-*.mjs` is not wired into the runner.                                                                                                      | The most dangerous failure: a protection everyone believes still runs.               |
| **A shared rulebook for humans and AI.** | `AGENTS.md`: mandatory reading path, final-state rule (no compat shims; delete replaced code in the same patch), spine-function comment style, verification order — the same contract for every contributor, silicon or not. | Every AI session and every new hire re-deriving the house rules, differently.        |
| **Intent that survives cleanup passes.** | This ADR set: decisions recorded with rejected alternatives, specifically so "helpful" refactors (DRY the config, spread Effect outward, merge the event vocabularies) meet a written answer.                                | Chesterton's fences removed by whoever finds them inconvenient.                      |

## Decision

Governance is executable, not aspirational. Every rule that matters is either
a gate script, a compile error, or a recorded decision — never only a
convention. The pipeline (`npm run verify`) runs format, lint, typecheck,
tests, build, then the 14 custom gates; a new gate must register with the
runner or the meta-gate fails; a new dependency must join an explicit
allowlist. The final-state rule applies to the whole blast radius of a change
— code, tests, docs, config — in the same patch. Adopters should run the same
`npm run verify` command in CI; this starter does not prescribe a CI vendor.

## Alternatives rejected

- **Convention + code review only** — the drift rate of AI-assisted
  development exceeds reviewer attention; this repo's own history shows the
  unguarded corners (docs truth, e2e liveness) rotting while the guarded ones
  held.
- **Standard linters only** — ESLint-class tools cannot express "pg lives
  only in db", "this doc owns that term", or a per-audience complexity
  budget; the custom gates are ~15 small, readable scripts, each testable
  against a bad fixture.
- **Trusting model quality** — the point is not that AI output is bad; it is
  that _unverified_ output drifts, and verification must be cheaper than
  generation. Gates are that arbitrage.

## Consequences

Contributors pay real friction: allowlist edits per dependency, budget
violations that force refactors mid-flow, doc headers on every durable page.
That friction is the product working as designed — it is what "optimized for
the next human maintainer rather than for the model" costs. The gates
themselves are code and need maintenance (the meta-gate guards their wiring,
not their relevance); when a gate outlives its reason, delete it with an ADR
note rather than letting it decay into ritual.
