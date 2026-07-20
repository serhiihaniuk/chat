# Workflow Substrate

Read this when: you change durable execution, Workflow bundles, replay, cancellation, world selection, or Workflow-owned maintenance in `apps/side-chat-service`.
Source of truth for: the service's Workflow ownership, bundle and realm boundaries, journal authority, world selection, and cancellation contract.
Not source of truth for: the ordered product turn lifecycle ([assistant-turn.md](assistant-turn.md)), client-tool policy ([client-tools.md](client-tools.md)), or tool approvals ([tool-approvals.md](tool-approvals.md)).

`apps/side-chat-service` uses Workflow DevKit with Postgres World as its durable
execution substrate. Workflow owns run continuation, durable hooks, replayable
journal data, and suspended waits. Application code still owns product policy,
authorization, persistence decisions, safe public outcomes, and admission.

## Ownership map

| Concern                              | Owner                   | Primary code                                  |
| ------------------------------------ | ----------------------- | --------------------------------------------- |
| Product preparation and finalization | `application/`          | `src/application/turn/`                       |
| Durable run shell and hook waits     | `workflows/`            | `src/workflows/chat-turn.ts`                  |
| Production Workflow entries          | `workflows/production/` | `src/workflows/production/chat-turn.ts`       |
| Testing-only Workflow entries        | `workflows/testing/`    | `src/workflows/testing/`                      |
| Workflow-realm dependencies          | workflow composition    | `src/composition/workflow/`                   |
| Product records and decisions        | PostgreSQL adapters     | `src/adapters/persistence/` and `packages/db` |

## Bundle and realm boundaries

The HTTP route bundle and Workflow bundle are separate module instances.
Production scans only `src/workflows/production`; compatibility builds scan only
`src/workflows/testing`. Each bundle initializes its matching typed registry.
Production composition must never resolve scripted models or compatibility
entries.

A workflow and a step may also execute in different realms. Values crossing
that boundary must be serializable. Provider credentials, fetch functions, SDK
closures, and database clients never enter the journal. A model handle journals
only provider identity, model id, and non-secret routing, then reconstructs the
provider model inside the step realm.

Request authentication is narrowed the same way. The route keeps the complete
`AuthContext`; Workflow input carries only its secret-free `DurableActorRef`.
Server-tool adapters receive that actor reference and resolve current authority
or credentials inside the executing realm. Bearer tokens never enter Workflow.

Client-tool originating-tab authority has a stricter split. The raw capability
is an HTTP secret retained only by the originating widget tab. The route hashes
it before Workflow start; Workflow input and journal may contain only the
digest needed to create the durable dispatch. Replay never exposes either the
raw capability or the digest to browser stream consumers.

## Turn and journal contract

1. The authenticated route prepares and persists the product turn.
2. `startChatTurn` starts the production Workflow and binds its `runId` to the turn.
3. `WorkflowAgent` writes raw model-call parts to the Workflow journal.
4. The HTTP edge converts raw parts to native `UIMessageChunk` values.
5. Replay translates the public UI cursor over the raw journal before tailing.
6. Finalization stores one terminal product outcome and a safe assistant message.

The Workflow journal owns replay and recoverable execution history. PostgreSQL
owns the durable browser snapshot, tenant-scoped turn state, tool decisions, and
maintenance eligibility. A hook wakes a suspended run; it is never the authority
for a product decision already stored in PostgreSQL.

## World selection and operations

World selection is a build-time choice. The production build sets
`WORKFLOW_TARGET_WORLD=@workflow/world-postgres`; `WORKFLOW_POSTGRES_URL` is the
runtime secret used by that compiled world. Changing the runtime target value
cannot switch an already-built artifact. Compatibility builds use the embedded
local world with disposable storage.

The service validates the pinned Postgres World schema at boot. Journal archive
and pruning run immediately and on a schedule. Maintenance excludes active runs,
legal holds, and product rows that are not terminal.

## Cancellation invariant

Cancellation first records durable product intent, then resumes the Workflow
cancel hook and wakes the active provider step's Workflow-owned abort stream.
The provider receives an `AbortSignal`; `run.cancel()` is not the product
cancellation mechanism. Abort failures retain the `AbortError` DOMException name
so the engine does not retry an intentionally cancelled provider call.

The pinned realm patch lives only in
`src/workflows/realm/abort-signal-patch.ts`. The compiled compatibility suite is
its removal tripwire: when the unpatched probe starts succeeding after an
upstream upgrade, delete the patch in the same change.

## Verification

- `npm run test:service:compatibility` proves compiled Workflow streaming,
  provider-observed cancellation, production/testing separation, and the patch
  removal criterion.
- `npm run lint:custom` proves bundle placement, dependency direction, testing
  isolation, and production import-graph rules.
- Database-backed replay and durability use the explicit container or persistent
  lanes in [verification.md](../operations/verification.md).
