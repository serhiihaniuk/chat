# 21 — Real tool registration seam + promise-based tool factory

**Epic:** 4 Seams | **Priority:** P0 (the product's headline extension point) | **Depends on:** — | **Status:** todo

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

- [ ] A new tool added via (tool file + map entry + config entry) is model-callable in the fake-provider harness with zero edits to validation/options-adapter internals (prove with a test tool in the adoption harness).
- [ ] An unknown configured tool name fails boot with an error listing available names.
- [ ] `createRuntimeToolFromPromise` is exported, tested (success, throw → `tool_failed` with scrubbed message, abort), and used by the worked example.
- [ ] extension-seams.md steps name real files that exist.

## Verification

```sh
npm test --workspace @side-chat/agent-runtime
npm test --workspace @side-chat/partner-ai-service
npm test --workspace @side-chat/adoption-harness
npm run verify
```
