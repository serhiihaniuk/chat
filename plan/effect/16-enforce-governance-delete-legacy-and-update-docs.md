# Step 16: Enforce Governance, Delete Legacy Architecture, and Update Documentation

Read this when: completing the rewrite after runtime cutover.

Source of truth for: final cleanup, automated architecture rules, canonical documentation updates, and release-level verification.

Not source of truth for: permission to retain temporary bridges. This step is complete only when replacement residue is gone.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 15

Unblocks: program completion

## Outcome

Only the new Effect v4 architecture remains. Custom governance prevents regression to hidden service registries, nested run boundaries, manual scopes, unsafe Promise wrapping, mutable runtime back-references, and Effect leakage. Canonical docs describe the implemented system as current state. Full verification and a disposable lifecycle smoke pass.

## Required deletion inventory

Search current history and remove all replaced equivalents, including names that changed during implementation. The initial audit identified:

- `StreamChatPorts`, `StreamChatPortsBundle`, and `createStreamChatPorts`;
- `ClockPort`, `systemClock`, and obsolete time test fakes;
- `ServiceToolRuntimeAccessor`, `bindRuntime`, and `runtimeHandle`;
- `createPartnerAiServiceApp` if it can discard release ownership;
- manual service `Scope.make`/`Scope.close` and local shutdown arrays;
- legacy reaper/runner/listener/dispatcher implementations;
- duplicate Promise adapters and broad error wrappers;
- optional observability plumbing replaced by explicit Layers;
- old composition bundles/factories used only by the prior architecture;
- compatibility aliases, deprecated exports, stale fixtures, and comments describing the old path.

Do not keep `legacy`, `v2`, `new`, `effect`, or `layered` suffixes once only one implementation remains. Rename the final path to domain names.

## Governance rules to add

Extend current custom lints with fixture-proven rules. At minimum enforce:

1. Effect remains forbidden in browser/widget/host-bridge/chat-protocol/shared boundary areas.
2. AI SDK/provider imports remain private to `packages/agent-runtime`; service composition consumes only its neutral exports.
3. `pg`/Drizzle remain in `packages/db`; Hono remains in the service.
4. Production `Effect.run*` is allowed only at NodeRuntime root, the Hono ManagedRuntime boundary adapter, and the approved AI SDK Promise adapter.
5. Manual `Scope.make`/`Scope.close` is forbidden in production service/core code.
6. Fallible I/O must not use unchecked `Effect.promise`; approved adapters use typed construction.
7. Core workflows may not accept or construct a `StreamChatPorts`-style mega registry.
8. Runtime services may not be mutated after construction through bind/set-runtime patterns.
9. Raw timers are forbidden in Effect-owned server/core code, with a narrow reviewed exception for the AI SDK delta coalescer only if still justified.
10. Fire-and-forget Effect execution and unobserved forks are forbidden.
11. Unstable Effect imports are allowlisted in isolated adapter modules only.

Each rule needs a positive repository pass and a governance fixture that proves a violating file fails with an actionable message. Avoid regex rules so broad that comments/tests or valid boundary adapters are rejected without reason.

## Canonical documentation updates

Update these to implemented current state, not aspirations:

- `docs/adr/0003-effect-as-core-effect-system.md`: mark superseded/replace it with the new Context/Layer/resource decision while preserving containment history;
- `docs/architecture/effect.md`: selected v4 baseline, services, Layers, errors, scopes, concurrency, tests, run boundaries, and upgrade policy;
- `docs/architecture/system-map.md`: final entry points and ownership;
- `docs/architecture/package-boundaries.md`: Effect/AI SDK/DB/Hono and Promise/stream boundaries;
- `docs/architecture/assistant-turn.md`: admission, capacity, cancellation, title, and finalization lifecycle;
- `docs/architecture/runtime-and-protocol-events.md`: runtime stream, retry gate, replay/live fan-out, and terminal semantics;
- `docs/operations/configuration.md`: resolved settings, timeouts/retries/capacity/observability;
- `docs/operations/capacity-and-deployment.md`: actual limits and overload behavior;
- `docs/operations/verification.md`: new conformance, lifecycle, governance, and Effect upgrade checks;
- package/composition READMEs for core, runtime, db, and service.

At completion, retain `plan/effect` as a historical execution record because it contains the requested decision and evidence handoffs. Mark its README and STATUS explicitly `completed/historical`, link to the canonical current architecture docs, and state that it is no longer implementation authority. Do not leave its disposition unresolved or let it compete with `docs/`.

## Implementation sequence

1. Run a repo-wide symbol/pattern/import inventory and create a final deletion checklist.
2. Delete legacy modules and migrate any remaining tests/callers to final names. Remove package exports and dependency exceptions that no longer apply.
3. Add/extend custom governance scripts and violation fixtures for the rules above. Register every new rule in `scripts/run-custom-lints.mjs`, update the governance meta-fixture, and update the documented gate count and order.
4. Update all canonical documentation from the verified implementation. Link to one owner per topic rather than duplicating large architecture descriptions.
5. Add readable file-level mental models to concept-dense final composition, turn workflow, host lifecycle, capacity, and runtime boundary-adapter modules. Delete comments that narrate obsolete migration history.
6. Run formatting and all focused conformance suites.
7. Run the full pinned repository gate.
8. Run disposable database tests and the fake-provider application lifecycle smoke.
9. Review `git diff`, generated files, lockfile, package exports, docs links, and dependency policy. Confirm no user/unrelated change was overwritten.
10. Mark every step and the architecture checkpoint complete only after its evidence exists. Fill the program completion section in `STATUS.md`.

## Final searches

Adapt paths/names to the final code, but initial searches include:

```powershell
rg -n 'StreamChatPorts|createStreamChatPorts|ClockPort|systemClock|bindRuntime|runtimeHandle|ServiceToolRuntimeAccessor|createPartnerAiServiceApp' .
rg -n 'Effect\.run(Sync|Promise|Fork)|Scope\.(make|close)|Effect\.promise|setTimeout|setInterval' apps packages
rg -n 'from "effect|from ''effect' packages/side-chat-widget packages/chat-protocol packages/host-bridge packages/shared
rg -n 'from "ai|from ''ai|@ai-sdk' packages apps
```

Expected legacy symbol result is zero outside historical ADR/plan evidence. Expected run/timer/import matches must exactly match documented allowlists.

## Final verification

Required:

```powershell
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
npm run test:e2e
npm run test:db:container
npm run test:e2e:persistent
npm run test:service:lifecycle
npm run audit
npm ls effect @effect/platform-node @effect/vitest
```

Also run the documented fake-provider application start/request/stream/cancel/shutdown smoke. Run a real-provider smoke only with explicit user authorization and safely scoped credentials; it is not required for normal local completion.

Review the output of:

```powershell
git status --short
git diff --stat
git diff --check
```

## Completion checklist

- [ ] The legacy deletion inventory has zero unexplained matches.
- [ ] All new governance rules have passing violation fixtures, actionable messages, custom-lint registration, meta-fixture coverage, and updated gate documentation.
- [ ] Package exports/dependencies/policies contain only the final architecture.
- [ ] Canonical docs and package READMEs describe verified current state.
- [ ] Concept-dense files have concise mental-model comments; stale migration comments are removed.
- [ ] Four conformance-suite families pass.
- [ ] Full pinned `npm run verify` passes.
- [ ] Disposable database tests pass.
- [ ] Browser E2E and persistent restart E2E pass.
- [ ] `npm run test:service:lifecycle` passes with clean fake-provider resource release.
- [ ] Dependency audit and Effect version-tree checks pass.
- [ ] Every program step and checkpoint has evidence and is marked complete in `STATUS.md`.
- [ ] Remaining risks and any explicitly skipped live-provider verification are recorded honestly.
- [ ] `plan/effect` is marked completed/historical and links to current canonical docs.

## Handoff record

Legacy deletion search: pending

Governance rules/fixtures: pending

Canonical docs changed: pending

Full verification: pending

Disposable integration: pending

Remaining risk: pending
