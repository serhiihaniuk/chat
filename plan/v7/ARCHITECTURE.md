# Side Chat Service Architecture (Normative)

Read this when: creating, moving, or reviewing ANY file in `apps/side-chat-service` — before writing code, not after.

Source of truth for: the target shape — layers, ports, dependency law, physical seams, and where each step's artifacts live.

Not source of truth for: step sequencing ([`README.md`](./README.md)) or verified engine facts ([`KNOWLEDGE.md`](./KNOWLEDGE.md)).

## The style

Hexagonal (ports and adapters), defined the way the previous version proved it works: **the application owns its ports; adapters implement them at the edges; composition wires them; dependency arrows point inward.** The old system's shape — core owning `ports/`, service owning `adapters/` + `inbound/` + `composition/` — is the proven ancestor of this layout.

Two additions make it correct for _this_ runtime:

1. **A physical overlay.** The Nitro workflow build creates seams that no logical layering may ignore: the route bundle and the workflow bundle are separate module instances; the workflow realm and step realm exchange only serializable values. Physical seams outrank folder aesthetics — the layout must make them loud.
2. **A deliberate non-goal.** The AI SDK and Workflow engine are the substrate, not a vendor to abstract away (ADR 0014/0016). We do NOT wrap the engine in ports. Ports exist only at genuine substitution points.

## The layout

```text
apps/side-chat-service/src/
  domain/            # pure product concepts and policy (grows from Step 05 on);
                     # imports nothing but itself
  application/       # use cases: run-turn, cancel-turn, approval policy, scrub
                     # policy, admission; OWNS ports/; engine-free, transport-free
    ports/           # interfaces the application needs implemented for it
  workflows/         # the WORKFLOW BUNDLE, physically: 'use workflow' / 'use step'
                     # shells, hooks, the realm patch, the step-bundle registry.
                     # Thin durable shells that DELEGATE to application code.
    production/      # durable entries scanned only by production builds
    testing/         # compatibility entries scanned only by test builds
  adapters/
    auth/            # driven: token/JWT authority implementations
    http/            # driving: Hono routes -> application use cases
    providers/       # driven: azure/openai implementations of the model port
    persistence/     # driven: packages/db implementations of store ports
    telemetry/       # driven: sink implementations
  config/            # ONE subsystem: config DSL, env adapter, validation; its catalog
                     # owns the three app-root sidechat*.config.ts declarations
  composition/       # route-bundle wiring (production/testing), resource scope,
                     # and initialization of the workflow-bundle registry
  testing/           # scripted model and doubles; wired ONLY by testing composition
  index.ts
```

## The dependency law

Arrows may point only inward; the lint enforces this with fixtures.

| Layer                          | May import                                                              | Must never import                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `domain`                       | domain                                                                  | everything else                                                                                         |
| `application` (+ its `ports/`) | domain, `ai` UI/core types (lingua franca per ADR 0014)                 | `hono`, `workflow`, `@ai-sdk/workflow`, provider packages, `pg`/drizzle, adapters, composition          |
| `workflows`                    | application (use cases + ports), `workflow`, `@ai-sdk/workflow`, `ai`   | `hono`, adapters/http, composition internals except its matching workflow-registry initializer          |
| `adapters/*`                   | application ports (to implement them), their own technology             | other adapters, composition, workflows internals (http may import workflow START/RESUME functions only) |
| `config`                       | itself; its catalog imports only the three app-root config declarations | runtime/framework dependencies and every other outward import                                           |
| `composition`                  | everything (it is the wiring)                                           | —                                                                                                       |
| `testing`                      | application ports, `ai`                                                 | production adapters' internals                                                                          |

Engine placement, precisely: **`workflow` and `@ai-sdk/workflow` imports are legal ONLY in `workflows/` and composition.** The application expresses "wait for cancellation" or "run the agent" through its own port types; `workflows/` implements those semantics with hooks, `getWritable`, `WorkflowAgent`, and the realm patch. This keeps every use case unit-testable without compiling a workflow.

## Ports: the earned inventory

Ports are interfaces the application defines because a real substitution exists. The known inventory (from the old system's proven port families plus the substrate decision):

| Port (application/ports)                                   | Production adapter                                 | Test/double                     |
| ---------------------------------------------------------- | -------------------------------------------------- | ------------------------------- |
| `ModelProvider` (construct a `LanguageModel` per settings) | `adapters/providers` azure/openai                  | `testing/` scripted serde model |
| `RequestAuthorizer`                                        | `adapters/auth` token/JWT authority                | deterministic test authority    |
| `TurnExecution` (start/cancel/attach a durable turn)       | `workflows/` shell via `workflow/api`              | in-process fake for route tests |
| `ConversationStore`, `TurnStore` (Step 09 shapes)          | `adapters/persistence` on `packages/db`            | memory implementations          |
| `TelemetrySink`                                            | `adapters/telemetry`                               | collecting fake                 |
| `Clock`/`IdGenerator`                                      | only if a test proves the need — do not pre-create |

Rules: a port is defined next to the application code that owns it; no port without two real implementations or a test that substitutes it; **never** a port around the SDK/engine itself.

## The physical overlay (non-negotiable)

1. Only `workflows/**` contains `'use workflow'` / `'use step'` directives.
2. Route and workflow bundles have separate composition entries. `composition/route/*` wires HTTP. `composition/workflow/production.ts` and `composition/workflow/testing.ts` initialize the **step-bundle registry** (`workflows/registry.ts`) in their own module instances. A workflow may import only the initializer matching its physical `workflows/production/` or `workflows/testing/` subtree. The registry is typed with real ports, rejects reads before initialization, and resets only in tests.
3. Nothing crosses workflow→step boundaries except serializable values; model instances crossing implement `WORKFLOW_SERIALIZE`/`WORKFLOW_DESERIALIZE`.
4. Abort-path errors keep the `AbortError` DOMException name (engine retries otherwise); cancellation is signal-based via durable hooks — `run.cancel()` is never the mechanism.
5. The realm patch lives in exactly one `workflows/` module with its removal-tripwire test.
6. Nitro scans only configured workflow directories. Production builds scan `workflows/production/`; compatibility builds scan `workflows/testing/`. Tests prove the production artifact contains no scripted-provider or compatibility marker.

## Where each step's artifacts land

| Step                          | Lands in                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 03 configuration/composition  | `config/`, `composition/`                                                                                                                                        |
| 04 providers, auth, telemetry | `adapters/providers`, `adapters/auth`, `adapters/http` (middleware), `adapters/telemetry`, `application/ports` (ModelProvider, RequestAuthorizer, TelemetrySink) |
| 05 turn execution             | `application/` (run-turn use case + TurnExecution port), `workflows/` (durable shell), `adapters/http` (routes)                                                  |
| 06 stream profile/scrub       | `application/` (scrub policy), `adapters/http` (transform placement)                                                                                             |
| 07 reconnect/replay           | `adapters/http` + `workflows/` (readable attachment)                                                                                                             |
| 09/10 persistence             | `application/ports` (stores), `adapters/persistence`, `packages/db`                                                                                              |
| 11 client tools               | `application/` (dispatch policy), `workflows/` (hook waits), `adapters/http` (result endpoint)                                                                   |
| 12 approvals                  | `application/` (policy + audit), `workflows/` (durable gate)                                                                                                     |
| 17 admission                  | `application/` (semaphore policy), wired in `composition/`                                                                                                       |

## Package boundaries (monorepo level)

The rewrite is NOT "one service instead of packages." A package exists where there are two real consumers or a browser/server split; a folder suffices where there is one consumer plus the dependency-law lint.

| Unit                                              | Form                               | Why                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/side-chat-service`                          | app with the layered folders above | single consumer of its own core; the old core-as-package reasons (Effect containment, engine independence) died with ADR 0014/0016; the seams that matter here are the in-app bundle seams, which a package boundary cannot express                                                          |
| `packages/db`                                     | package (kept)                     | consumed by the service, tooling, and tests; owns schema/repositories                                                                                                                                                                                                                        |
| `packages/side-chat-widget`                       | package (kept)                     | browser product                                                                                                                                                                                                                                                                              |
| `packages/host-bridge`                            | package (kept)                     | browser/host integration                                                                                                                                                                                                                                                                     |
| `packages/stream-profile` (name final at Step 06) | **package (new, small)**           | the Side Chat profile of the UI message stream — `data-*` part types and the error-code vocabulary — imported by BOTH the widget and the service; dependency-free and browser-safe (the shrunken successor of `chat-protocol`'s legitimate role). Step 06 creates it; Steps 13/14 consume it |

**Extraction trigger** (recorded so the folder-vs-package call is never re-litigated ad hoc): `application/` + `domain/` get extracted into a package only when a second real consumer appears (another app, a CLI, an embedding variant) or when export-surface enforcement demonstrably beats the lint. Never speculatively.

## The turn, end to end (the worked example)

The old core's `prepareStreamChatTurn` — the staged, commented, everything-before-the-stream-opens pipeline — is the style this architecture preserves. Its qualities were the staging discipline and the pre-stream contract, not Effect and not the protocol machinery beneath it. The new anatomy:

**1. Route bundle, request time — `application/turn/prepare-turn.ts`.** Plain async, one named stage per line, same contract as the old core: everything that must succeed before the stream opens; a failure rejects the HTTP request instead of half-opening an SSE response.

```ts
export async function prepareTurn(deps: TurnDeps, input: TurnRequest): Promise<PreparedTurn> {
  // Prove the caller may act in this workspace.
  const auth = await deps.authorize(input);
  // Choose the model, tools, and limits for this turn.
  const plan = resolveTurnPlan(deps.settings, input, auth);
  // Block unsafe requests before any durable write.
  await runTurnGuards(deps, input, auth, plan);
  // Load or create only the conversation this subject may access.
  const conversation = await deps.conversations.ensureAuthorized(input, auth);
  // Bound concurrent generations before any durable write.
  const slot = await deps.admission.admitTurn();
  // Store the user message and the turn record the run attaches to.
  const userMessage = await deps.messages.appendUser(conversation, input);
  const turn = await deps.turns.startRecord(conversation, plan, userMessage); // unique index = race-safe busy guard
  return { auth, plan, conversation, turn, slot };
}
```

**2. Workflow bundle — `workflows/turn.ts`, the thin durable shell.** Durability mechanics only: the realm patch, the cancel hook raced with the agent, `getWritable()`, the `WorkflowAgent` constructed from the plan (model via the registry's `ModelProvider` port), and delegation to `application/turn/finalize-turn.ts` (idempotent persist + guarded terminal transition) on every exit. The `WorkflowAgent` lives here and only here.

**3. The route** is three lines: `prepareTurn` → `start(runTurn, [serializablePreparedRef])` → stream response through the scrub transform.

Old → new mapping (nothing is orphaned):

| Old core module                                                              | New home                                                                |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `prepare-stream-chat-turn.ts`                                                | `application/turn/prepare-turn.ts` (same job, plain async)              |
| `turn-policy-plan`, guards                                                   | `application/turn/`                                                     |
| `guardConcurrentConversationTurn`                                            | Step 09 partial unique index + the admission slot                       |
| user message / assistant turn records                                        | store ports → `adapters/persistence`                                    |
| `run-turn-generation`, protocol event stream, state machine, runtime mapping | **no successor — the engine's stream is the protocol**                  |
| `finalization/**`                                                            | `application/turn/finalize-turn.ts`, invoked from the shell's end/catch |
| lease/heartbeat/reaper                                                       | no successor — durable runs replaced death-detection                    |

## Anti-patterns (each observed on 2026-07-11; the lint carries fixtures for them)

1. **Folder cosplay**: `ports/` holding value builders or schemas instead of behavioral interfaces; `application/` holding utilities filed to satisfy a taxonomy.
2. **Core-as-adapter**: the turn (the product's central use case) filed under `adapters/` because it touches the engine. The use case is application; only its durable shell is `workflows/`.
3. **Adapter→adapter dependencies**: inbound HTTP importing workflow modules' internals directly instead of driving an application port.
4. **Self-assembling modules**: a workflow or adapter constructing its own dependencies inline (e.g., hard-coding a scripted model) instead of receiving them via composition/registry.
5. **Doubles in the production path**: test models/fakes under `adapters/`; they live in `testing/` and only the testing composition wires them.
6. **One subsystem sliced across layers**: configuration split over `ports/`+`application/`+`adapters/` to feed the taxonomy; cohesive subsystems stay together.
7. **Purity lints that ignore physics**: architecture checks enforcing layer imports while encoding nothing about bundle/realm seams.

## Instruction for executors (and for prompting agents)

Do not "make it hexagonal" by installing folders. The architecture is: _dependencies point inward; the turn logic knows neither transport nor engine; boundaries follow the runtime's physical seams; an interface exists only where substitution is real._ When adding a file, answer three questions in order: which bundle must it compile into (physics), which layer owns its knowledge (law), does it need a new port (earned, not pre-built) — then the location is determined, not chosen.
