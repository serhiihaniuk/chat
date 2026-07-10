# Step 08: Build the Live and Test Layer Graph

Read this when: composing services into a complete application environment or preparing the architecture checkpoint.

Source of truth for: the target Layer graph, acquisition ownership, memoization, dependency direction, and Live/Test composition roots.

Not source of truth for: the final Node executable, readiness signals, or ordered process shutdown, which belong to Step 15. The application ManagedRuntime and Hono boundary adapter are part of this step.

Status: `not_started`

Owner: unassigned

Depends on: Step 07

Unblocks: architecture checkpoint and Steps 09-16

## Outcome

The repository has an acyclic Layer graph that constructs every server/core service from validated settings and owned resources. One ManagedRuntime materializes that graph, and one Hono boundary adapter runs request/subscription Effects through it. The real application boots after this step. Production, fake/demo, deterministic test, and injected persistence use the same architecture; services remain immutable after construction.

## Composition modules

Use names that fit the current package, but keep these responsibilities visible:

- configuration/settings Layer;
- diagnostics/logger/tracer/metric foundation;
- persistence resource Layer and Effect adapters;
- provider/model registry and AI runtime Layer;
- context/policy/security/capability Layers;
- tool registry and tool execution Layer;
- product workflow services;
- background service Layers, initially dormant until Step 09;
- Hono dependency/handler services, without starting Node;
- permanent product telemetry plus native Logger foundation and deterministic test collector;
- one ManagedRuntime owner and Hono Effect/Promise/stream adapter;
- complete application Layer;
- deterministic Test Layer builders.

Do not expose one `ServiceComposition` object containing every constructed value. The Layer graph itself is composition. Small handles are acceptable only at non-Effect boundaries.

## Required cycle repair

Remove the current mutable tool/runtime back-reference represented by `ServiceToolRuntimeAccessor`, `bindRuntime`, or `runtimeHandle`.

Preferred design:

1. define a `ModelOnlyInvoker` service for auxiliary/sub-agent model calls that do not require registered runtime tools;
2. build it from provider/model services independently of the tool registry;
3. let tools depend on `ModelOnlyInvoker` where appropriate;
4. build the full `AgentRuntime` from providers plus the completed tool registry.

The mock web-search/sub-agent path should use `ModelOnlyInvoker` if it invokes no tools. If inventory shows a true unavoidable cycle, document it and use a composition-owned `Deferred` with scoped failure/cleanup; do not retain mutation or nullable runtime fields.

## Implementation sequence

1. Draw the actual graph from Step 05 service tags, Step 06 adapters/resources, and Step 07 settings. Detect cycles before writing composition code.
2. Split current composition bundles by resource/service ownership, not by historical factory grouping. Reuse pure builders where they remain clear.
3. Build leaf Layers first: settings, safe diagnostics, persistence, provider clients, deterministic primitives.
4. Build middle Layers: repositories/services, context, policy, security, capabilities, model-only invocation, tools, runtime.
5. Build workflow and route dependency Layers without running them.
6. Build application variants by replacing leaf Layers:
   - production Live;
   - fake/demo with scripted provider and memory persistence;
   - deterministic Test;
   - caller-injected persistence/test embed.
7. Ensure common resource Layers are shared/memoized once per application runtime. Do not manually cache services in module globals.
8. Add partial-acquisition failure tests and assert finalization order. Inject a failure at each major construction boundary.
9. Build the permanent product telemetry and native Logger service/Layer contracts plus test collectors now. Later steps emit through these final services; Step 14 adds Tracer, Metric, semantic instrumentation, and exporters without replacing call-site contracts.
10. Materialize `ApplicationLive` in exactly one ManagedRuntime per app instance. Create one Hono adapter that uses that runtime environment; it must not build a default/nested runtime per request or tool call.
11. Cut routes, turn runner, and service app construction directly to the new core/services/runtime path. Delete `StreamChatPorts`, old workflow modules, old composition factories/bundles, and unsafe compatibility shapes in the same cutover.
12. Add runtime isolation tests: two separately built applications must not share repositories, tool registries, fiber registries, IDs, or mutable provider state unless explicitly external.
13. Prove the real fake/demo application boots and serves its focused contract through the single Hono adapter after cutover.
14. Produce an updated graph in this file or a dedicated composition README and submit the architecture checkpoint defined in the program README.

## Layer construction rules

- Use scoped construction for anything with release behavior or background ownership.
- Register finalizers immediately after acquisition.
- Keep secrets redacted until the client constructor edge.
- Use Layer dependencies, not import-time singletons.
- Avoid providing a Layer deep inside a workflow; provision at composition boundaries.
- Prefer explicit Live and Test exports for cohesive services over a generic option-heavy factory.
- Validate selected v4 semantics for Layer memoization, `Layer.effect`, scoped construction, merging, provisioning, and launch. Do not guess v3 method names.

## Contract tests

- all Step 02 workflow contracts run against the deterministic Test graph;
- Live-like fake/demo composition boots without network credentials;
- the full production graph validates configuration before opening expensive resources where dependency order allows;
- shared resource Layer acquires once per application runtime;
- separate runtimes remain isolated;
- partial acquisition releases all previously acquired resources in reverse dependency order;
- injected persistence is not released;
- the runtime/tool cycle is absent and services are never mutated after construction;
- application graph construction contains no Effect run call.
- the real Hono app uses one ManagedRuntime instance and boots after the old composition path is deleted;
- permanent diagnostics/product telemetry are available to all later background/retry/capacity steps without temporary interfaces.

## Architecture checkpoint package

Before marking this step complete, prepare reviewer evidence:

- a current Mermaid or text dependency graph;
- service inventory and ownership table;
- Live/Test/injected variant matrix;
- cycle search and removed back-reference evidence;
- resource acquisition/release trace;
- Layer memoization and runtime isolation test results;
- search results for `StreamChatPorts`, old workflow/composition modules, manual scope construction, nested/default runtimes, and service mutation.

The independent reviewer records the decision in `STATUS.md`. Correct findings before Step 09.

## Verification

```powershell
rg -n 'bindRuntime|runtimeHandle|ServiceToolRuntimeAccessor|StreamChatPorts|createService.*Bundle|Effect\.run|Scope\.make|ManagedRuntime' apps/partner-ai-service packages/partner-ai-core
npm test -- apps/partner-ai-service/src/composition
npm test -- packages/partner-ai-core
npm run typecheck
npm run lint:oxlint
npm run lint:custom
```

Explain legitimate remaining matches. Manual run/scope calls in production composition are not legitimate final-state matches.

## Completion checklist

- [ ] Acyclic service dependency graph is documented.
- [ ] Production, fake/demo, deterministic Test, and injected-persistence variants use the same architecture.
- [ ] Mutable runtime/tool back-reference is removed.
- [ ] Common resources are Layer-memoized once per runtime.
- [ ] Partial acquisition, release order, and runtime isolation tests pass.
- [ ] `StreamChatPorts`, the old core workflow, and replaced composition bundles/factories are deleted at direct cutover.
- [ ] Exactly one ManagedRuntime owns `ApplicationLive`; Hono uses its one approved run boundary.
- [ ] The real fake/demo application boots and serves focused contracts after cutover.
- [ ] Permanent product telemetry/native Logger services and test collectors are available.
- [ ] No other production composition module executes Effects directly.
- [ ] Architecture checkpoint evidence is ready and `STATUS.md` is updated.
- [ ] Composition, core, type, and governance gates pass.

## Handoff record

Application Layer entry points: pending

ManagedRuntime/Hono adapter entry points: pending

Dependency graph: pending

Removed cycle symbols: pending

Architecture checkpoint reviewer: pending

Verification: pending
