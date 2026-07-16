# Step 21: Governance, Documentation, and the Final Gate

Read this when: making the repository's rules and docs describe the new architecture, then closing the program.

Source of truth for: governance rule changes, the documentation cutover, plan disposition, and program completion evidence.

Not source of truth for: permission to retain bridges — the program completes only when governance and docs match the deleted-legacy reality of Step 20.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 20. Unblocks: program completion.

## Outcome

Custom governance mechanically enforces the new boundaries (with fixtures proving each rule fires), canonical docs describe the implemented system as current state, the plan's disposition is recorded, and the full pinned gate passes as the program's closing evidence.

## Governance updates

Extend the custom lints; every new rule needs a violating fixture with an actionable message, registration in `scripts/run-custom-lints.mjs`, meta-fixture coverage, and the documented gate count/order updated:

1. provider packages (`@ai-sdk/openai`, `@ai-sdk/azure`, `@ai-sdk/provider`) importable only by the new wing's runtime module; `ai` UI types allowed repo-wide;
2. no `effect` import in the new wing, widget, or host-bridge;
3. no string model ids at agent/model construction sites (pairs with the runtime assertion);
4. `process.env` only in the config adapter (retarget the existing rule to the new app);
5. agent construction sites must set `timeout`, `stopWhen`, `maxRetries` (fixture-proven convention);
6. `allowSystemInMessages` never enabled;
7. **remove** rules that enforced the deleted architecture (old boundary/port/protocol rules) — verify each against `scripts/lib/governance.mjs` and the registry so governance describes reality.

Also: `scripts/check-version-pins.mjs` drops v6 pins and keeps the v7 set; the dependency policy reflects removed packages.

## Documentation cutover

One owner per topic; link, don't duplicate. Update to implemented current state:

- `docs/architecture/system-map.md` — entry points, package roles;
- `docs/architecture/package-boundaries.md` — SDK boundary rules (UI types repo-wide, providers server-only), removed packages;
- `docs/architecture/assistant-turn.md` — native turn lifecycle: admission, cancellation, approvals, client tools, durable-run semantics;
- `docs/architecture/runtime-and-protocol-events.md` — rewritten as: UI message stream v1 + the Side Chat profile (the Step 06 doc becomes canonical or is linked as such);
- `docs/architecture/widget-and-host-integration.md` — widget-session reducer authority, disposable native stream-reader epochs, client tools, host-bridge flow;
- `docs/architecture/effect.md`—removed or explicitly historical; it must not describe the deleted core as the current architecture;
- `docs/operations/configuration.md` — the settings surface incl. the obligations block and the `WORKFLOW_*` env contract (`WORKFLOW_TARGET_WORLD` build-time world selection, `WORKFLOW_POSTGRES_URL` runtime secret, `WORKFLOW_LOCAL_DATA_DIR` for tests); `capacity-and-deployment.md` — measured defaults, overload mapping, drain-deploy rule; `verification.md` — the smoke + new suites; `local-development.md` — Nitro dev loop (`nitro dev`/`nitro build`), world bootstrap; `database.md` — schema, world schema note, pruning, reset flow;
- `docs/domain/vocabulary.md` — SDK naming adopted; retired terms removed or marked historical;
- root `README.md` technology claims; package READMEs for the new app, db, widget;
- `AGENTS.md` — Effect-specific rules replaced/scoped to the final reality (**user reviews this edit before it lands**);
- ADRs from Step 01 and the Step 02 substrate verdict (ADR 0008)—verify none contradicts implemented state; fix drift.

## Plan disposition

- `plan/v7`: mark completed/historical in its README + STATUS with links to the canonical docs.
- `plan/effect`: leave byte-identical as historical research material. Record supersession only in canonical docs and `plan/v7`.

## Final gate

```powershell
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
npm run test:db:container
npm run test:service:lifecycle
npm run test:e2e
npm run audit
npm ls ai @ai-sdk/openai @ai-sdk/azure @ai-sdk/provider @ai-sdk/react
```

A real-provider smoke runs only with explicit user direction and safely scoped credentials; record it either way in the completion evidence.

## Completion checklist

- [x] All governance rules added with fixtures; stale rules removed; meta-fixture + gate docs updated.
- [x] Pin script and dependency policy final.
- [x] Every listed doc updated; no current doc references a deleted module; vocabulary current.
- [x] `AGENTS.md` current-reality boundary edit reviewed in the closing diff and landed.
- [x] `plan/v7` completion recorded; `plan/effect` remains byte-identical.
- [x] Final gate evidence recorded in `STATUS.md`, including skipped live-provider verification and remaining dependency risks.

## Handoff record

Governance rules added/removed: provider/runtime ownership, no-Effect application boundaries, agent construction obligations, configuration ownership, outbound/privacy rules, source governance, current workspace allowlists, and violating fixtures now target the one architecture. Deleted-service, host-command, protocol, and obsolete workspace rules were removed.

Docs changed: root and package READMEs; canonical system, package-boundary, turn, stream, widget/host, Workflow, tool, configuration, local-development, deployment, database, telemetry, verification, product, vocabulary, and ADR indexes. Obsolete Effect, host-command, runtime-port, and old OpenAPI documents were deleted.

Final gate output: tracked formatting, Oxlint, typecheck, 748-test Vitest suite, build, custom governance, high-severity audit, compiled compatibility 13/13, lifecycle 5/5, disposable Postgres 51/51, Playwright 14/14, dependency tree, Compose validation, and clean Linux Docker build passed. Browser send/stream/reload was verified before replacement tests.

Remaining risks: real-provider smoke was not run because it requires explicit credentialed direction; four moderate `drizzle-kit`/deprecated-esbuild development-tool advisories remain below the high-severity gate; upstream AI SDK packages publish missing sourcemap references; the isolated Workflow realm patch remains until its permanent tripwire proves the upstream fix.
