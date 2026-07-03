# 21 — Real tool registration seam + promise-based tool factory

**Epic:** 4 Seams | **Priority:** P0 (the product's headline extension point) | **Depends on:** — | **Status:** done

## Problem

1. **The config tool surface is fiction.** `tools.availableTools` in `sidechat.config.ts` implies pluggability, but validation throws `Unsupported configured tool` for anything but `mock_web_search` (`apps/partner-ai-service/src/config/sidechat-config/validation.ts:182-184`), and the options adapter maps **every** entry to `createMockWebSearchRegistration` regardless of name (`options/options-adapter.ts:158-174`). The `extension-seams.md` "Add a tool" recipe dead-ends: `server.ts` builds options exclusively from config, so there is no registry list to add to without editing three config-internal files.
2. **The code seam demands the most Effect fluency in the repo** for the least Effect-fluent audience: `RuntimeTool.execute` is `Effect.Effect<JsonObject, AiRuntimeError, never>` (`packages/agent-runtime/src/tools/runtime-tool.ts:36-40`); the worked example (`apps/partner-ai-service/src/adapters/tools/examples/jira-search-issues-tool.ts`) requires `Effect.gen`, `yield*`, `Effect.mapError`, typed failures.

What's already good and must be preserved: bundled declaration+executable registration (`createServiceToolRegistration`) makes manifest drift impossible; profile allowlisting + per-turn narrowing are validated and tested.

## Decided approach

1. **Service-owned registration map:** a single module (e.g. `apps/partner-ai-service/src/adapters/tools/tool-registrations.ts`) mapping tool name → `ServiceToolRegistration` factory. `createToolRegistrations` dispatches on the configured name via this map; validation accepts any name present in the map (unknown name → error listing available names). Adding a tool becomes: write the tool file, add one map entry, add one config entry. Document that exact file as _the_ place in extension-seams.md.
2. **`createRuntimeToolFromPromise`** in `agent-runtime` (public export): `{ name, description, inputSchema, readSources?, run: async (input, ctx) => JsonObject }` wrapped via `Effect.tryPromise`, throws mapped to `tool_failed` with the message scrubbed per the existing hygiene rules (the executor already normalizes non-Effect failures — `runtime-tool-executor.ts:53-69`). Keep the Effect signature as the advanced path.
3. Convert the Jira example to show **both flavors** (promise-first, Effect variant below it); the mock web search stays Effect (it exercises the advanced path).
4. Update `extension-seams.md` "Add a tool": the three-step recipe against the real files, both flavors, and the config exposure block (`exposure.defaultMode`, approval ids — noting story 24's approval honesty).

## Acceptance criteria

- [x] A new tool added via (tool file + map entry + config entry) is model-callable with zero edits to validation/options-adapter internals — `tool-registrations.test.ts` proves an injected map entry dispatches; `tool-config-registration.test.ts` boots the fake config and asserts the config tool is offered in the `/tools` manifest and profile allowlist; the adoption harness registers a promise-authored tool and asserts it is offered + executes.
- [x] An unknown configured tool name fails boot with an error listing available names (`tool-config-registration.test.ts`).
- [x] `createRuntimeToolFromPromise` is exported, tested (success, throw → `tool_failed` with scrubbed message, abort, deliberate typed error), and used by the worked Jira example.
- [x] extension-seams.md steps name real files that exist.

## Delivery notes (2026-07-03)

- **The config tool surface is real now.** New `apps/partner-ai-service/src/adapters/tools/tool-registrations.ts` holds `DEFAULT_TOOL_REGISTRATIONS` (tool name → registration factory). The config validator (`validation.ts`) accepts exactly the names in the map, and the options adapter (`options-adapter.ts` `registrationForTool`) dispatches the configured name through it — an unknown name is a loud boot error naming the available tools, not a silent fallback to the mock. Adding a config-driven tool is now three edits: tool file, one map entry, one config entry — no validator/adapter changes. The registry is an optional parameter (defaulting to the shipped map) so tests inject a new entry without editing the dispatcher.
- **`createRuntimeToolFromPromise`** (new public export from `@side-chat/agent-runtime`): `{ name, description, inputSchema, timeoutMs?, readSources?, run: async (input, ctx) => JsonObject }`. A thrown error is scrubbed to a stable `tool_failed` message (raw text never crosses the boundary); a caller abort maps to `aborted`; a deliberately thrown `AiRuntimeError` keeps its code. The Effect signature stays the advanced path.
- **Jira example shows both flavors.** `createJiraSearchIssuesTool` (promise-first, via the factory) and `createJiraSearchIssuesToolEffect` (Effect variant) — one promise-based `JiraClient`, a parameterized test proving both behave identically at the boundary (including scrubbing a raw client error). The mock web search stays Effect.
- **Docs:** extension-seams.md "Add a tool" rewritten as the real three-step recipe (naming `tool-registrations.ts`, both flavors, the `exposure`/allowlist block), the seam-map row updated, and the stale "not injectable yet (plan/21)" notes corrected.
- Gotchas handled: no `@types/json-schema`, so a `JSONSchema7`-typed pass-through trips `no-unsafe-assignment` — the factory takes `JsonObject` for the schema. The fake provider only scripts a `mock_web_search` tool call, so the end-to-end "model-callable" proof is the manifest/allowlist offering (execution is covered by the mock + factory unit tests) rather than a driven tool-call.
- Verification: agent-runtime + service + adoption suites green (274 tests), `npm run verify` clean. e2e was 12/13 with a rotating environmental flake (socket/warmup pressure from repeated runs); each flaked test — including the `local-service` iframe test that boots the real service — passes cleanly in isolation, and the widget bundle is unchanged by this server-side story.

## Verification

```sh
npm test --workspace @side-chat/agent-runtime
npm test --workspace @side-chat/partner-ai-service
npm test --workspace @side-chat/adoption-harness
npm run verify
```
