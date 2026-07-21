# ADR 0005: Keep AI-Assisted Development Under Executable Governance

Status: accepted 2026-07-02; rebaselined 2026-07-16

## Context

This repository is built with heavy AI assistance and is intended for
lower-context maintainers. Plausible individual changes can gradually erode
boundaries, documentation, dependency ownership, and readability faster than
human review notices the pattern.

## Decision

Rules that protect the architecture are executable rather than conventional:

- standard formatting, TypeScript-aware lint, strict type checking, tests, and
  project-reference builds run through repository scripts;
- 16 custom gates enforce dependency pins, package ownership, service layers,
  widget FSD ranks, runtime boundaries, outbound calls, optional contracts,
  code shape, source governance, agent-skill integrity, documentation,
  generated artifacts, and gate fixtures;
- the meta-gate proves every `check-*.mjs` file is registered and every gate
  rejects a known-bad fixture;
- cognitive complexity, nesting, file/function size, and TypeScript assertion
  budgets target a lower-context human maintainer;
- durable documentation declares its audience and ownership, while canonical
  vocabulary and architecture documents prevent competing sources of truth;
- `AGENTS.md` gives human and AI contributors the same boundary, verification,
  and completion contract.

Architecture changes update code, tests, configuration, and canonical
documentation in one coherent patch. A new dependency joins an explicit policy
allowlist. A new gate joins the fixed runner and fixture suite.

## Alternatives rejected

- **Convention and code review alone:** drift accumulates across individually
  reasonable changes.
- **Standard linters only:** they cannot express package ownership, source-of-
  truth documentation, or repository-specific architecture laws.
- **Trust model quality:** generated code still needs cheaper, deterministic
  verification than repeated manual reconstruction.
- **Keep obsolete gates as ritual:** a gate that no longer protects a current
  decision should be removed with its documentation and fixtures.

## Consequences

Contributors pay deliberate friction when adding dependencies, crossing
boundaries, increasing complexity, or changing documentation ownership. The
gates themselves require maintenance; their wiring is mechanically protected,
but their relevance still needs architectural review.
