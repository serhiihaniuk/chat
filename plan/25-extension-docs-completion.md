# 25 — Extension docs completion

**Epic:** 4 Seams | **Priority:** P1 | **Depends on:** 20–24 (document the final seams) | **Status:** todo

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

- [ ] No doc claims host-command model emission is unbuilt; the worked example covers both declaration sites.
- [ ] extension-seams.md has Context sources and Auth (story 20) rows; every step in every recipe names files that exist (trace each manually).
- [ ] db README's entity recipe exists; database.md has the graduation section.
- [ ] Exactly one type is named `HostCommandCapability` repo-wide.

## Verification

```sh
npm run lint:custom   # docs gate
npm run verify
```
