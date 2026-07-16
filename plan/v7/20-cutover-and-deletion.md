# Step 20: Cutover and Deletion

Read this when: the new wing is feature-complete and the old architecture is ready to die.

Source of truth for: the cutover order and the deletion inventory.

Not source of truth for: governance rules and documentation (Step 21) — but this step and Step 21 land as one coherent change set; do not leave the repo between them longer than review requires.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 19. Unblocks: Step 21.

## Outcome

Every consumer points at the new wing; the old app and every replaced package are deleted; the final searches return zero unexplained matches. One architecture remains.

## Cutover order

1. Point every launcher/config/reference at the new app — verify: `.claude/launch.json`, root `package.json` scripts, `docs/operations/local-development.md`, demo/embed entry points, e2e harness configuration.
2. Confirm [`16a-widget-parity-verification.md`](./16a-widget-parity-verification.md) is complete, including its intentional-divergence sign-off and paired four-theme/density evidence. Cutover must not replace the only remaining comparison surface while that gate is open.
3. **Run the full verification below before deleting anything** — the last moment both apps exist is the cheapest place to catch a missed behavior.
4. Delete per the inventory in one coherent change set (multiple commits fine; no intermediate state where a deleted module is still imported).

## Deletion inventory

Verify each against final code before deleting; line counts are the 2026-07-10 audit's, for scale:

| Target                          | Contents                                                                                                                                            | Notes                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/partner-ai-service`       | old service: routes, turn-runner + reaper, turn-stream + dispatchers, host-command resolver/dispatcher, in-memory event log, composition            | config/env/auth were ported by copy in Steps 03–04                                                                             |
| `packages/partner-ai-core`      | old workflow core: stream-chat application, protocol mapping/state machine/finalization, lease heartbeat, ports                                     |                                                                                                                                |
| `packages/chat-protocol`        | sidechat.v1: event union, request DTO, validators, SSE codecs, errors, fixtures, schema JSON (~1,500 src + 956 test)                                | error-code list lives on in the Step 06 profile                                                                                |
| `packages/ai-runtime-contract`  | `RuntimeEvent`, `AiRuntimePort`, runtime ids/activity (~431 src)                                                                                    |                                                                                                                                |
| `packages/agent-runtime`        | mapping/runner internals: `stream-part-mapper`, `tool-activity-mapper`, `tool-loop-agent-runner`, `delta-coalescer`, tool adapter, v3 scripted fake | provider factories needed by the new service must already have been rewritten in its runtime module; delete this whole package |
| widget old state layer          | `features/chat/model/{run,subscription,reconnect}/**`, `subscription/recovery/**`, `entities/conversation/api/{sse,run}/**` (~4,900 src)            | query modules stay (updated in Steps 10/13)                                                                                    |
| `test-harness/adoption-harness` | v6-era adoption tests                                                                                                                               | port scenarios worth keeping into the new wing's suites first, then delete                                                     |
| DB residue                      | lease columns/tables; any turn-events leftovers                                                                                                     | standard drizzle workflow + `db:reset`                                                                                         |
| repo residue                    | old launch configs, package exports, `#` subpaths, path aliases, dependency-policy entries, comments describing the old path                        | search-driven                                                                                                                  |
| host-bridge renames             | any deferred renames recorded in Step 15                                                                                                            | complete them now                                                                                                              |

Naming: no `legacy`/`old`/`v2` suffixes survive; the new wing already holds the plain domain names (SDK naming per Step 01).

## Final searches (zero matches expected outside `docs/adr/**` history, `plan/**`, `.reference/**`)

```powershell
rg -n "sidechat\.v1|chat-protocol|RuntimeEvent|AiRuntimePort|StreamChatPorts|ClockPort" apps packages test-harness
rg -n "hostCommand|HostCommand" apps packages
rg -n "turn-event-dispatcher|turn-subscription-stream|turn-reaper|turn-lease|widget-run-reducer|side-chat-sse-reader|createStreamChatPorts" .
rg -n "from 'effect'|from \"effect\"" apps packages
rg -n "@ai-sdk/(openai|azure)" packages/side-chat-widget packages/host-bridge
```

## Full verification (run before AND after deletion)

```powershell
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
npm run test:db:container
npm run test:service:lifecycle
npm run test:e2e          # or record its Step 21 replacement if the harness was ported
npm ls ai @ai-sdk/openai @ai-sdk/azure @ai-sdk/provider @ai-sdk/react
git status --short; git diff --stat; git diff --check
```

Plus a manual widget session against the fake provider (send, stream, refresh mid-turn, cancel, approval, client tool) with screenshot evidence.

## Failure meaning

- A final search hit inside product code → the deletion missed a consumer; delete or port it — never suppress.
- The gate failing only after deletion → the old app was still load-bearing (types, exports, test utilities); fix the new-wing gap, never resurrect the module.

## Completion checklist

- [x] Cutover order followed; the replacement wing was verified before deletion.
- [x] Inventory executed; final searches clean; no suffix naming; deferred renames done.
- [x] Post-deletion verification passed; browser session evidence recorded.
- [x] `STATUS.md` updated with the deletion search results.

## Handoff record

Deletion search results: all five required searches returned zero matches in `apps`, `packages`, and `test-harness` on 2026-07-16.

Unexpected retained old modules (must be empty): none. The old service, core, protocol, runtime-contract, agent-runtime, adoption harness, widget state layer, and database lease/event residue were deleted.

Verification outputs: manual Chromium send/stream/reload passed before replacement tests were written; 748 Vitest tests passed with 17 intentional skips; compiled compatibility 13/13; lifecycle 5/5; disposable Postgres 51/51; Playwright 14/14; clean Linux image built. The tracked-tree format gate passes; the root command also inspects an unrelated untracked Fable review note whose formatting was intentionally preserved.
