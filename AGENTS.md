# Side Chat agent instructions

Read this when: you work anywhere in this repository.
Source of truth for: agent workflow, safety boundaries, code-quality expectations, and completion reports.
Not source of truth for: domain vocabulary, lifecycle order, package ownership, database tooling, or verification details; follow the canonical docs linked below.

These instructions apply to the whole repository. A more specific `AGENTS.md` in a child directory may add or narrow them for that subtree. Follow the user's request and higher-priority system instructions first.

## Mission

Make the smallest coherent change that solves the requested problem and leaves the repository easier for a human maintainer to understand. In this pre-alpha foundation, a clean rewrite can be the smallest coherent change when the current design is the problem. Prefer evidence over assumption, deletion over compatibility residue, and explicit code over clever code. Do not claim a behavior, test, or command is correct until you inspected or ran the relevant evidence.

## Pre-alpha foundation posture

This repository is being built before alpha, production use, or any external compatibility promise. Treat the current implementation, architecture, internal APIs, old plans, and historical decisions as replaceable working material—not as authority that must be preserved. We intentionally have a rewrite window now; after alpha, the same changes would require slower incremental migration.

This is a standing instruction for every task, not only architecture tasks:

- Prefer the best justified long-term design over the smallest diff or a compatibility wrapper. A ground-up rewrite, boundary change, or deletion of a subsystem is allowed when it produces a materially simpler, safer, more readable, more correct, more observable, more performant, or more scalable foundation.
- When a requested change looks like a local patch over a weak abstraction, stop and evaluate the clean replacement. Do not silently cement a bad boundary just because it already exists or because the requested ticket sounds narrow.
- Re-check old architectural assumptions against the current official libraries, SDKs, and repository evidence. A decision made before a useful API or capability existed is not a reason to avoid using it now.
- Consider both immediate benefits and foundational improvements. Take low-risk improvements that help now, but do not let quick wins hide a rewrite that should happen before alpha.
- Bring every material rewrite, boundary change, or subsystem deletion to the user's attention before taking that broader implementation branch, even when it is adjacent to the requested task. The user is open to discussion; do not silently expand the scope or choose the rewrite on the user's behalf. Explain the evidence, target shape, why replacement beats incremental repair, what would be deleted, and how the result would be verified.
- Treat documentation as part of the architecture, not as cleanup after the code. Before implementing a material architectural change, update or create the appropriate source-of-truth architecture document, plan, or ADR so the proposed target and decision are explicit. Keep the documentation update in the same coherent change as the implementation, and update affected lifecycle, boundary, protocol, operations, and package docs whenever the rewrite changes them.
- Do not use the pre-alpha rewrite posture as permission to ignore, bypass, or leave documentation stale. If the existing docs are wrong, identify the conflict and repair the source of truth before or alongside the code change.
- Do not preserve code solely because it is already tested, documented, familiar, or expensive to understand. Tests and docs are evidence to migrate or replace; they are not reasons to keep an inferior design.
- Keep the rewrite recommendation bounded and justified. Do not expand into unrelated work, but do surface material architectural consequences before implementing a local workaround.

When proposing a rewrite, state explicitly: current failure or constraint, target architecture, affected boundaries, documentation source of truth, deletion plan, migration or cutover shape, security and data risks, verification strategy, and why the pre-alpha timing makes the change worthwhile. When the rewrite is approved or already requested, documentation comes first: record the target and decision, then implement, then re-audit every affected document before claiming completion.

## Before you work

Classify the request before editing:

- **Answer or review:** inspect the relevant code and report evidence. Do not change files unless asked.
- **Change or build:** inspect, edit, verify, and report the result.
- **Destructive, external, or production action:** stop before the action and request explicit direction if the request does not already authorize it.

For code or durable-document changes, read this path first:

1. [`docs/README.md`](docs/README.md)
2. [`docs/domain/vocabulary.md`](docs/domain/vocabulary.md)
3. [`docs/architecture/system-map.md`](docs/architecture/system-map.md)
4. [`docs/architecture/package-boundaries.md`](docs/architecture/package-boundaries.md)
5. The nearest package or folder `README.md`

Read the matching flow document for stream, runtime, protocol, or widget work:
[`assistant-turn.md`](docs/architecture/assistant-turn.md),
[`runtime-and-protocol-events.md`](docs/architecture/runtime-and-protocol-events.md),
[`widget-and-host-integration.md`](docs/architecture/widget-and-host-integration.md),
or [`effect.md`](docs/architecture/effect.md).

Read the matching operations document for local run, configuration, capacity,
deployment, or database work:
[`local-development.md`](docs/operations/local-development.md),
[`configuration.md`](docs/operations/configuration.md),
[`capacity-and-deployment.md`](docs/operations/capacity-and-deployment.md),
or [`database.md`](docs/operations/database.md).

Inspect `git status --short` and the relevant diff before editing. Existing changes belong to the user. Preserve them, avoid unrelated cleanup, and do not infer that an untracked or deleted file is yours to remove.

Use `rg` and `rg --files` for repository search. Read the smallest useful source range first, then expand around callers, tests, and boundary adapters. Use absolute paths in tool calls when the shell or workspace makes path resolution ambiguous.

## Skills

Skills are optional, task-focused procedures. `AGENTS.md` remains the repository-wide contract; a skill adds workflow guidance and never replaces current source, package scripts, architecture docs, or the user's request.

Use the smallest set that matches the task:

- [`side-chat-code-quality-gate`](.agents/skills/side-chat-code-quality-gate/SKILL.md): readability, simplification, maintainability, architecture boundaries, comments, static gates, or code review.
- [`side-chat-documentation`](.agents/skills/side-chat-documentation/SKILL.md): durable docs, READMEs, ADRs, architecture notes, runbooks, or stale-document audits.
- [`side-chat-design-system`](.agents/skills/side-chat-design-system/SKILL.md): widget tokens, density, themes, Base UI primitives, portal contracts, hook utilities, styling, or design-system documentation.
- [`side-chat-testing-architecture`](.agents/skills/side-chat-testing-architecture/SKILL.md): test level, test design, fixtures, deterministic doubles, coverage, or flaky-test repair.

Work with a skill as follows:

1. Select it from the task's primary concern. If several apply, announce the order and use only the minimal combination.
2. Read its `SKILL.md` completely before taking task actions.
3. Resolve any `references/`, `assets/`, or `scripts/` paths relative to that skill directory. Load deeper references only when the skill points to them or the task needs them.
4. Validate every path, symbol, command, threshold, and architecture claim against the current repository. Skill examples are guidance, not repository truth.
5. Keep changes inside the user's requested scope. Do not edit a skill merely to make an unrelated task pass.
6. If a skill is missing, stale, or conflicts with current code, report the specific conflict and repair the skill or use the nearest safe fallback.
7. In the final response, mention any material decision or change caused by the skill. Do not mention a skill inside production code comments.

## Safe autonomy

Proceed without a permission handoff for ordinary, local, reversible work: reading files, searching, editing requested files, formatting, running tests, and inspecting generated output. Ask only when the next action is destructive, irreversible, credential-gated, production-facing, externally communicative, or materially changes scope.

Never do any of the following unless the user explicitly requests it:

- reset, checkout, clean, or discard existing changes;
- stage, commit, push, open a pull request, deploy, or send an external message;
- read, print, commit, or copy secret values from `.env`, credentials, tokens, or provider responses;
- send real provider requests or mutate a non-disposable database;
- rewrite unrelated files to make a gate pass.

Use `apply_patch` for hand edits. Formatting tools may rewrite files when formatting is the requested mechanical operation. Do not edit generated artifacts directly; find and run their generator or report the gap.

## Change discipline

- Keep the diff reviewable and coherent. Prefer small, behavior-preserving changes for local fixes, but do not constrain a justified pre-alpha foundation rewrite to an artificially small diff.
- This repository is pre-production. When an internal API is replaced, remove its old helpers, aliases, comments, tests, and docs in the same coherent patch.
- Do not add a dependency unless the user requests it. If a dependency is necessary, update the package policy and lockfile together.
- Update canonical docs in the same patch when code changes ownership, lifecycle order, protocol events, domain terms, configuration, or verification behavior.
- Public `sidechat.v1` contracts are real product contracts even before alpha: change them deliberately, update both sides, and add contract-focused tests. Their current shape is still replaceable before release when a better contract is justified; do not preserve it only for backward compatibility.
- Do not weaken a test, lint rule, type rule, boundary rule, or security check merely to make the change pass.

## Repository boundaries

Use the canonical system map and package-boundary document for complete details. The load-bearing ownership is:

| Area                                 | Owns                                                                                   | Must not absorb                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `partner-ai-core`                    | Product workflow, policy, context admission, turn lifecycle                            | HTTP, provider SDKs, database or transport details           |
| `agent-runtime`                      | AI SDK/provider execution, runtime tools, provider-native stream parts, `RuntimeEvent` | Product policy, HTTP, browser DTOs, database rows            |
| `chat-protocol`                      | `sidechat.v1` DTOs, validators, schemas, SSE codec, protocol constants                 | Effect, provider DTOs, database details                      |
| `db`                                 | PostgreSQL/Drizzle schema and repository adapters                                      | HTTP, provider SDKs, product workflow                        |
| `apps/partner-ai-service`            | Hono routes, configuration adapter, composition, app adapters, transport conversion    | Browser rendering and provider logic outside the runtime     |
| `side-chat-widget` and `host-bridge` | Browser UI, client state, host integration, protocol consumption                       | Effect, AI SDK/provider DTOs, database rows, server workflow |

Preserve these invariants:

- Keep AI SDK and provider-native stream parts inside `packages/agent-runtime`.
- Keep `pg` and `drizzle-orm` inside `packages/db`; keep `hono` inside the service.
- Read `process.env` through the service configuration adapter.
- Keep Promise, `ReadableStream`, and `AsyncIterable` conversions at transport edges.
- Map provider parts to `RuntimeEvent`, then map `RuntimeEvent` to `sidechat.v1` once per boundary.
- Keep browser, client, widget, and protocol packages Effect-free and provider-DTO-free.
- Use package exports and `#...` subpaths instead of cross-package or cross-source relative imports.
- Treat `packages/side-chat-widget/src/shared/ai/**` as quarantined copied UI code. Do not use it as a project-style example or place Side Chat business logic there.

Core and server workflows are Effect-first. Verify Effect v4 APIs against installed type declarations and [`docs/architecture/effect.md`](docs/architecture/effect.md), not memory from another Effect version. Expected failures use `Effect.fail`, `Effect.try`, or `Effect.tryPromise`; raw `throw` is a defect. Use exported uppercase constant objects with uppercase properties for closed runtime value sets.

## Readability and simplicity

Write for a lower-context human maintainer, not for AI working memory:

- Target cognitive complexity around 8 or less for ordinary functions and around 6 or less for Effect, Stream, AI SDK, and React state/effect functions.
- Keep nesting to two levels when practical. Treat four levels as the outer limit, not a target.
- Keep one abstraction level per function. Separate policy, selection, transformation, persistence, transport, rendering, and error mapping into named stages.
- Prefer named steps, guard clauses, precise domain names, and existing utilities over nested expressions, clever one-liners, type tricks, and abstraction layers that only hide simple work.
- Do not split code into arbitrary tiny helpers if the split increases navigation or concept count.
- **Frequently missed — check every change:** extract repeated or domain literals (statuses, error codes, reasons, tuned numbers) into named constants, and reuse shared helpers, types, and value sets instead of copying them. Do not hardcode another package's contract values; key off the boundary signal you own or import the shared constant. Duplicated helpers and inline magic values are a recurring regression, especially under time or cost pressure.

Use structure before comments. Add comments only for a contract, invariant, failure or privacy rule, lifecycle boundary, non-goal, or non-obvious reason. A boundary comment should make the local role, source representation, target contract, hidden detail, and preserved invariant understandable without the implementation plan. Concept-dense files need a short file-level mental model. Delete comments that merely narrate syntax or describe an obsolete design.

## Documentation and vocabulary

Canonical docs own their topics. Link to them instead of copying their vocabulary or architecture tables into package READMEs:

- [`docs/domain/vocabulary.md`](docs/domain/vocabulary.md) owns terms.
- [`docs/architecture/assistant-turn.md`](docs/architecture/assistant-turn.md) owns lifecycle order.
- [`docs/architecture/system-map.md`](docs/architecture/system-map.md) owns package roles and entry points.
- [`docs/architecture/package-boundaries.md`](docs/architecture/package-boundaries.md) owns import and data boundaries.
- [`docs/architecture/runtime-and-protocol-events.md`](docs/architecture/runtime-and-protocol-events.md) owns event and streaming contracts.
- [`docs/operations/verification.md`](docs/operations/verification.md) owns commands and what they prove.
- [`docs/operations/database.md`](docs/operations/database.md) owns schema and database tooling.

When a doc and code disagree, verify the code and report or fix the stale source of truth. Do not keep replaced target-state, plan, or compatibility docs as if they describe the current system.

## Security and data handling

- Treat authentication, authorization, tenant/workspace ownership, host commands, tools, protocol validation, and database access as trust boundaries.
- Keep secrets, raw provider errors, prompts, retrieved content, tool payloads, and private conversation data out of logs, diagnostics, protocol events, tests, and final responses.
- Validate untrusted input at the owning boundary. Preserve idempotency, ownership checks, timeout, cancellation, size, rate, and resource limits.
- Do not use real credentials, real provider calls, or persistent production data for local verification unless explicitly requested and safely scoped.

## Verification

Run the narrowest relevant check first. Expand verification to match the risk:

| Check                           | Use                                                                       |
| ------------------------------- | ------------------------------------------------------------------------- |
| `npm run format:check`          | Formatting is stable.                                                     |
| `npm run lint:oxlint`           | Oxlint and TypeScript-aware lint pass.                                    |
| `npm run typecheck`             | Strict TypeScript contracts compile.                                      |
| `npm test -- <file-or-pattern>` | The changed behavior has a focused test pass.                             |
| `npm test`                      | Deterministic repository tests pass.                                      |
| `npm run build`                 | Project-reference build succeeds.                                         |
| `npm run lint:custom`           | Side Chat boundaries, source governance, code shape, and docs gates pass. |
| `npm run audit`                 | No high-or-above npm advisory is reported.                                |
| `npm run verify`                | The complete local gate passes in its documented order.                   |

For database, container, persistent E2E, or provider smoke work, read [`docs/operations/verification.md`](docs/operations/verification.md) first. Use disposable infrastructure and the dedicated command. Never describe a blocked or skipped check as passing.

If the local runtime does not match the supported Node/npm range, use the pinned reproducible command from [`README.md`](README.md):

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

When a check cannot run, report the exact command, blocker, what did run, and the remaining risk. Do not hide an environment failure behind a generic verification claim.

## Completion report

End every implementation response with:

- changed files and the user-visible or architectural result;
- readability, boundary, or security issue fixed;
- tests and checks actually run, with failures or skips;
- docs, comments, vocabulary, generated files, and copied/vendor files affected;
- remaining risk, dense areas, or follow-up work.

Stop when the requested result is implemented and verified, or when a real blocker requires user input. Do not leave the repository in a half-finished state merely because a stronger optional check would be useful.

BE BRIEF
