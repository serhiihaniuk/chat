# Agent Rules

Read this first.

## Mandatory Reading Path

Before changing code or durable docs, read:

1. `docs/README.md`
2. `docs/domain/vocabulary.md`
3. `docs/architecture/package-map.md`
4. `docs/architecture/boundaries.md`
5. The nearest package or folder `README.md`

For stream-chat, runtime, protocol, or widget changes, also read the matching
flow doc under `docs/domain` or `docs/architecture`.

## Final-State Rule

This repo is pre-production. Prefer the clean final shape over compatibility
wrappers for unshipped internal APIs. Delete replaced helpers, docs, comments,
tests, aliases, and temporary notes in the same patch.

Public `sidechat.v1` protocol contracts are real product contracts and must be
changed deliberately with tests.

## Human Cognitive-Load Budget

Write for a lower-context human maintainer, not for AI working memory.

- Ordinary changed functions should stay around cognitive complexity 7 or less.
- Effect, Stream, AI SDK, protocol, and React state/effect functions should stay
  around 5-6 when practical.
- Keep nesting to 2 levels when practical; 4 is the outer wall.
- Prefer named lifecycle stages over clever nested expressions.

## Documentation Rule

Docs are part of the quality gate. Canonical terms live in
`docs/domain/vocabulary.md`. Lifecycle order lives in
`docs/domain/lifecycle.md`. Package READMEs are local cards, not global
vocabulary dumps.

Update docs in the same patch when code changes package ownership, lifecycle
order, protocol events, domain terms, or verification behavior.

## Comments And Spine Functions

Prefer structure and names first. Use comments for boundary contracts,
invariants, failure semantics, lifecycle points, or non-goals.

Spine functions that coordinate several lifecycle steps should read top-down
with step comments explaining what each step proves, records, hides, prepares,
or finalizes.

Dense boundary comments should name source, target, hidden detail, and invariant.

## Boundaries

Core/server workflows are Effect-first:

- `packages/partner-ai-core` exposes `streamChatEffect(input)`.
- `packages/agent-runtime` exposes `streamEffect(request)`.
- Promise and `AsyncIterable` conversions belong at transport edges.
- Expected Effect failures use `Effect.fail`, `Effect.try`, or
  `Effect.tryPromise`; raw `throw` is a defect.

AI SDK and provider-native stream parts stay inside `packages/agent-runtime`.
Browser, client, widget, and protocol packages stay Effect-free and
provider-DTO-free.

Constants use exported uppercase constant objects and uppercase properties.

## Copied/Vendor-Style Code

`packages/side-chat-widget/src/shared/ai/**` is quarantined copied UI code. Do
not use it as a project style example. Do not put Side Chat business logic,
protocol mapping, runtime knowledge, persistence, auth, or Effect/AI SDK
workflow logic there.

## Verification

Run the narrowest relevant test first, then use the repo gates that match the
change:

```sh
npm run lint:oxlint
npm run typecheck
npm test
npm run lint:custom
npm run verify
```

If the local shell is not on Node `24.16.0` and npm `11.15.0`, use the pinned
runtime command from `README.md`.

## Final Response Contract

Report changed files, the readability or boundary issue fixed, verification
run, and remaining risk. For worker-style reports, include docs updated,
comments added/deleted, vocabulary terms changed, copied/vendor files excluded,
and any files that still feel dense.
