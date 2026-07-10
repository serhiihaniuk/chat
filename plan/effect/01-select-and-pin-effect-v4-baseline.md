# Step 01: Select and Pin the Effect v4 Baseline

Read this when: beginning the rewrite or upgrading Effect while the program is active.

Source of truth for: how the program selects, validates, pins, and records its Effect v4 API baseline.

Not source of truth for: the version that happens to be current today. The executor must query official sources at execution time.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: none

Unblocks: every later step

## Outcome

The repository first captures critical beta.70 behavior traces, then moves to the newest coherent, supportable Effect v4 version set available at execution time. Exact versions are pinned across every workspace and governance rule, installed declarations are the API authority, the ignored official source clone matches the selected release, and the same traces plus the complete repository gate pass after the change.

Beta.70 is the historical starting point, not a constraint. Do not select unqualified npm `latest`: on 2026-07-10 it referred to Effect v3 while the v4 line used the `beta` tag.

## Current evidence

- Root `package.json` pins `@effect/vitest` beta.70.
- `apps/partner-ai-service/package.json` pins `effect` and `@effect/platform-node` beta.70.
- Effect-using package manifests pin `effect` beta.70.
- `scripts/check-version-pins.mjs` hard-codes the same versions.
- `package-lock.json` resolves beta.70 and its platform peer packages.
- `.reference/effect` is ignored reference material and was cloned from the official v4 repository.

Reinspect all of these before editing. The set may have changed.

## Selection rules

1. Prefer a stable Effect v4 release if the official package line has reached stable and the companion packages support it.
2. Otherwise use the newest v4 beta whose `effect`, `@effect/platform-node`, and `@effect/vitest` peer ranges are mutually compatible.
3. Do not mix release trains merely because npm accepts the installation.
4. Pin exact versions. Do not use caret, tilde, tag, workspace wildcard, or Git URL specifications.
5. Check release notes and source diffs from the current version for breaking API changes, removed unstable modules, runtime semantics, and TypeScript requirements.
6. Native Logger, Tracer, and Metric adoption is mandatory. Only an external exporter package is optional. Isolate unstable exporter imports so their breakage cannot force workflow code to change.

## Implementation sequence

1. Record the current dependency state and run the full gate before upgrading. A pre-existing failure must be understood before it can be attributed to Effect.
2. Before changing packages, add or run neutral characterization traces for generation after start-response disconnect, resumed-SSE disconnect, explicit cancel, host-command notify/poll/timeout races, listener reconnect, terminalization, and application shutdown. Store observable events/state/release order, not Effect internals.
3. Query npm dist-tags and metadata for all three packages. Inspect `peerDependencies` and `peerDependenciesMeta` for the exact candidates.
4. Inspect the official Effect v4 repository tags/releases and update `.reference/effect` to the matching commit without tracking the clone.
5. Compare the current and candidate changelogs plus installed declaration surfaces used by this repository. Search for every imported Effect symbol and unstable subpath.
6. Select one coherent set and document why it is preferred over the prior version and any newer incompatible candidate.
7. Update every workspace manifest that directly imports Effect. Update the root dev dependency, `scripts/check-version-pins.mjs`, dependency policy only if package ownership changes, and `package-lock.json` together.
8. Use a normal npm install/update command so the lockfile is generated, not hand-edited. Confirm only intended dependency graph changes occurred.
9. Replace provisional API notes in `KNOWLEDGE.md` with exact imports and signatures for services, Layers, scopes, ManagedRuntime, NodeRuntime, concurrency primitives, scheduling, tests, and observability. Record whether ManagedRuntime acquisition is lazy and how readiness forces it; repeated dispose behavior; run-option AbortSignal support; NodeRuntime signal exit codes/custom teardown; dependency versus merged-sibling Layer finalizer order; FiberMap duplicate-key semantics; PubSub offer/drop/lag semantics; and whether semaphore fairness is documented or must not be claimed.
10. Compile existing code against the selected version and repair version-induced breakage without starting the architectural rewrite.
11. Run the pre-upgrade traces against the selected version and explain every delta. Unapproved lifecycle/streaming deltas block the selection.
12. Run the full pinned gate. If an upstream beta regression exists, produce a minimal reproduction and choose the newest earlier coherent v4 version; never silence type or test failures.

## Commands and evidence

Use current equivalents if npm changes its output shape:

```powershell
npm view effect dist-tags --json
npm view @effect/platform-node dist-tags --json
npm view @effect/vitest dist-tags --json
npm view effect@beta version peerDependencies --json
npm view @effect/platform-node@beta version peerDependencies --json
npm view @effect/vitest@beta version peerDependencies --json
rg -n 'from "effect|from "@effect|from ''effect|from ''@effect' apps packages test-harness
```

After installation:

```powershell
npm ls effect @effect/platform-node @effect/vitest
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

Record the selected package versions, official tag/commit, npm metadata date, release-note links, `npm ls` result, and verification result in this file and `STATUS.md`.

## Contract and tests

This step must preserve all current behavior. Existing tests plus the pre-upgrade neutral traces are the contract. Add a small version-coherence governance test only if `check-version-pins.mjs` cannot already detect mixed Effect v4 trains or unsupported peer ranges.

Failure meaning:

- type errors usually indicate an API change that later plans must account for;
- lifecycle/test changes may indicate a semantic runtime change and require source investigation;
- lockfile peer warnings mean the chosen set is not coherent;
- unstable observability breakage should be isolated, not papered over with assertions.

## Completion checklist

- [ ] A stable-or-beta v4 selection rule was applied with current evidence.
- [ ] Critical lifecycle/stream/host-command traces were captured on beta.70 before installation changed.
- [ ] Exact coherent versions are pinned in every importing workspace and the root.
- [ ] `scripts/check-version-pins.mjs` and the lockfile match.
- [ ] `.reference/effect` points to the selected official source revision and remains ignored.
- [ ] `KNOWLEDGE.md` records exact selected APIs and unstable imports.
- [ ] ManagedRuntime readiness/disposal, signal exit, finalizer order, FiberMap, PubSub, AbortSignal, and semaphore semantics are recorded.
- [ ] Existing code compiles without compatibility assertions or suppressed errors.
- [ ] The same critical traces pass on the selected version, with every approved delta recorded.
- [ ] The full pinned verification command passes.
- [ ] `STATUS.md` contains the selection and evidence.

## Handoff record

Selected versions: pending

Official source revision: pending

Breaking changes relevant to later steps: pending

Verification: pending

Deviations: none
