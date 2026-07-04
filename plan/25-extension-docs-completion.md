# 25 — Extension docs completion

**Epic:** 4 Seams | **Priority:** P1 | **Depends on:** 20–24 (document the final seams) | **Status:** done

## Problem

Four high-value extension paths are undocumented or documented wrongly:

1. **Host commands — docs say the built seam doesn't exist.** Model-driven host commands are fully implemented and tested end-to-end (core relays descriptors per turn — `build-model-turn-request.ts:34-44`; runtime exposes them as model-callable tools — `agent-runtime/src/runtime/ai-sdk/ai-sdk-tool-adapter.ts:59-96`; activity emission — `tool-activity-mapper.ts:81-104`; service resolver round-trip — `service-composition.ts:130-134`; e2e-style test at `agent-runtime.test.ts:242-301`). But `docs/architecture/host-commands.md:206-211` says "agent-runtime does not yet read that scope… not model-callable in production" and cites `toolScope.allowedHostCommandNames`, a field that no longer exists; `docs/architecture/runtime-and-protocol-events.md:26-27,108-109` and `extension-seams.md:28` repeat the claim. Adopters will build workarounds for a working feature. Also: the guide walks only the server-side declaration — one sentence is missing that commands must ALSO be advertised by the browser bridge's `getCapabilities` or dispatch returns `unsupported`.
2. **Context sources have no seam documentation.** The likeliest adopter change ("feed our CRM record into context") crosses a closed union (`CONTEXT_CANDIDATE_SOURCE_TYPES`, `partner-ai-core/src/domain/capabilities/contracts/capabilities.ts:39-46`), a `{history}`-only budget type (`contracts/context.ts:103-105`), and two exhaustive switches in the service — 5+ files, zero docs (extension-seams.md has no context row). Redaction is classification-only (SECRET candidates dropped, no masking hook) — undocumented.
3. **"Add a table/entity" has no recipe** — the real steps span ~7 files (schema-contract record+command, drizzle table + `sidechatTables`, mapper, both adapters, shared contract test, `SCHEMA_ENTITY_TYPES` governance test, `db:generate`).
4. **The single-fresh-migration policy has no graduation story** (`docs/operations/database.md:20-22` documents day-one; nothing says when/how an adopter switches to incremental migrations: stop regenerating, real `drizzle-kit generate` chain, retire `db:reset`'s `DROP SCHEMA CASCADE`).
5. Two types named `HostCommandCapability` with different shapes (host-bridge `{…, resourceTypes?}` vs core `{…, approvalMode}` — `packages/host-bridge/src/commands/capability.ts:18-23` vs core `contracts/capabilities.ts:170-175`), and the two guides link one each.

## Decided approach

1. Rewrite the three host-command doc sections to the built reality (post story 08's relay and story 24's approval wall); add the browser-capabilities sentence to the worked example.
2. Add an extension-seams **Context sources** section: the honest current answer (swap the whole `ContextManagerPort` = easy; add a source type = cross-package change touching these N files), plus the redaction-is-classification note. Optional stretch (owner call, note in the story when executing): loosen `ContextSourceTokenBudgets` to `Record<ContextSourceId, number>` so a new source stops reshaping a core contract — if done, it's a code change with tests, not just docs.
3. Write "Adding an entity" in `packages/db/README.md` (the 7-file checklist, each step naming its gate/test).
4. Write "Graduating to incremental migrations" in `docs/operations/database.md`.
5. Rename one of the `HostCommandCapability` twins (decision: host-bridge's → `BrowserHostCommandCapability`; it has the fewest importers) and cross-reference both docs.

## Acceptance criteria

- [x] No doc claims host-command model emission is unbuilt; the worked example covers both declaration sites.
- [x] extension-seams.md has Context sources and Auth (story 20) rows; every step in every recipe names files that exist (trace each manually).
- [x] db README's entity recipe exists; database.md has the graduation section.
- [x] Exactly one type is named `HostCommandCapability` repo-wide.

## Verification

```sh
npm run lint:custom   # docs gate
npm run verify
```

## Delivery notes

**Most host-command docs were already correct.** FOUNDATION-REVIEW (2026-07-01)
flagged `host-commands.md`, `runtime-and-protocol-events.md`, and
`extension-seams.md` as claiming host-command model emission is unbuilt — but an
earlier docs pass (story 08/10) already rewrote them to the built reality
("model-driven emission (production)"). Grep-confirmed zero remaining
`allowedHostCommandNames` / "not model-callable" / "does not yet read" phrases in
source or docs. The one live stale reference to the dead `toolScope.allowedHostCommandNames`
field was in `apps/docs/content/docs/walkthrough/add-a-tool.mdx:176` — fixed to
the real `hostCommands: input.request.hostCommands` (verified against
`build-model-turn-request.ts:44`).

**Type rename (item 5).** Renamed the host-bridge `HostCommandCapability` (the
`{…, resourceTypes?}` browser twin) → `BrowserHostCommandCapability`
(`packages/host-bridge/src/commands/capability.ts` + its index re-export). It had
**zero external importers by name** (only `HostCapabilities` is consumed
downstream), so the rename was contained to two files. Exactly one
`export type HostCommandCapability` now exists repo-wide (core's manifest shape,
`capabilities.ts:196`). Both guides cross-reference the two shapes.

**Host-command worked example (item 1).** Added the missing sentence: a command
declared in server config is not model-callable until the **browser bridge
advertises it via `getCapabilities`** — that advertised list rides to the server
as `request.hostCommands`, which core relays into `toolScope.hostCommands`
(`build-model-turn-request.ts:44`) to expose the command as a callable tool, and
`createHostBridge` returns `unsupported` for any command not in it. Also updated
the `approvalMode` note to story 24's reality: non-`never` now **fails boot** (the
approval wall), not "validated but silently unenforced."

**Context sources seam (item 2).** New "Feed a context source" seam-map row +
how-to in `extension-seams.md`, at three honest levels: tune admission via
`options.capabilities` (config, no code); replace the whole `ContextManagerPort`
(code — and a flagged **seam gap**: the bundled service builds its own via
`createServiceContextManager` and exposes no `options.contextManager` override
today); add a new source type (cross-package change through the closed
`CONTEXT_CANDIDATE_SOURCE_TYPES`, the `{history}`-only `ContextSourceTokenBudgets`,
a service gatherer, `context-candidate-creation.ts`, and the two exhaustive
switches in `context-admission.ts` — `sourceRank` + `sourceBudgetKeyForCandidate`,
both guarded by `noFallthroughCasesInSwitch`). Documented redaction as
classification-only: a `secret` candidate is dropped whole (`REDACTION_BLOCKED`),
no field-level masking hook. The **Auth row already existed** (story 20).

**Optional stretch — owner call: NOT done.** The story offered loosening
`ContextSourceTokenBudgets` from `{ history: number }` to
`Record<ContextSourceId, number>` so a new source stops reshaping a core contract.
Skipped: story 25's acceptance criteria are all docs, the stretch is a code+test
change with no criterion, and the honest doc already explains the current
`{history}`-only constraint (arguably a more useful signal than hiding it). Left
as a noted seam-improvement for a future code story.

**Recipes (items 3, 4).** `packages/db/README.md` gained an "Adding an entity"
6-step, layer-ordered recipe naming its two failing gates (the
`SCHEMA_ENTITY_TYPES` governance test and the shared contract suite) and the
`db:generate`-reads-`dist/` rebuild gotcha; every file path was traced and
verified to exist (`entities.ts`, `repositories.ts`, `ids/persistence-ids.ts`,
`lifecycle.ts`, `schema-contract.test.ts`, `drizzle/schema.ts` `sidechatTables`,
`records/records.ts`, the grouped `records/` files with their raised 9/8 budgets,
`memory/store/store.ts`, `repository-contract.test-support.ts`). `docs/operations/database.md`
gained "Graduating to incremental migrations" (stop `db:generate`, freeze the
baseline, generate deltas with `drizzle-kit generate`, apply forward-only with
`drizzle-kit migrate` after populating `dbCredentials.url`, retire `db:reset`'s
`DROP SCHEMA … CASCADE`).

**Verification.** `npm run lint:custom` (docs gate) green; `npm run verify` green
(**622 passed | 4 skipped**); `apps/docs` build green (the edited walkthrough page
rebuilds). All four acceptance criteria grep-verified.
