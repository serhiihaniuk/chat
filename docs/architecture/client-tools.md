# Client Tools

Read this when: you add, execute, resume, render, or test a browser-executed tool in the replacement `apps/side-chat-service` stack.
Source of truth for: the client-tool lifecycle, durable dispatch authority, output endpoint, timeout and cancellation behavior, and browser/server ownership boundary.
Not source of truth for: server-tool approvals ([tool-approvals.md](tool-approvals.md)), generic widget-host integration ([widget-and-host-integration.md](widget-and-host-integration.md)), or Workflow bundle mechanics ([workflow-substrate.md](workflow-substrate.md)).

A client tool is a model-callable action executed by the browser or host page.
The replacement stack uses it for the use cases previously called host commands.
A server tool runs inside the service; a client tool dispatches to the connected
browser, waits durably for an authenticated result, and returns that result to
the model.

## Lifecycle

1. The originating widget tab generates a cryptographically random, run-scoped
   client-tool capability and advertises bounded client-tool definitions with it.
2. The HTTP edge validates the definitions, hashes the capability, and passes
   only its digest into durable execution.
3. The Workflow creates a durable dispatch row containing that digest before
   exposing the tool call.
4. The originating tab executes each `toolCallId` once and submits its bounded
   output with the raw capability.
5. `POST /api/chat/:runId/tools/:toolCallId/output` hashes and matches the
   capability before reading the private body. Missing, malformed, or wrong
   authority is indistinguishable from a missing dispatch.
6. The first terminal writer persists the output, then resumes the Workflow hook.
7. The Workflow rereads the row and returns the persisted output to the model.

The durable dispatch row is the authority. The hook token
`tool:<runId>:<toolCallId>` is only a wake-up signal. The Workflow rereads after
hook registration to close the result-before-registration race. A result that is
durable while the hook is temporarily unavailable returns a retryable conflict;
a duplicate submission reuses the recorded terminal outcome.

## Timeout, cancellation, and restart

The wait races the result hook, a durable timeout, and turn cancellation.
Timeout and cancellation each persist one public-safe error output before the
Workflow continues. A late browser result records its timing but cannot re-enter
a run whose terminal dispatch outcome already won.

The wait survives service restarts because the dispatch and hook are durable.
Any authorized instance may accept the result. Replay restores dynamic tool
identity on native UI chunks and deduplicates repeated journal steps before the
widget reducer sees them. Other tabs may watch the same replay, but only the tab
that retained the raw capability may invoke the host bridge or post output. A
watcher without the capability leaves the call pending; it must not manufacture
a bridge-unavailable failure.

## Security and privacy

- Authenticate and prove workspace, subject, run, turn, and tool-call ownership
  before reading or storing output.
- Validate the output envelope at the HTTP boundary; never trust browser payloads.
- Do not place private tool payloads in activity notifications, logs, telemetry,
  or public error responses.
- Bind results to the exact durable dispatch. A `runId` alone is not authority.
- Keep the raw capability only in the originating tab's active-turn cursor and
  live attachment epoch. It must not enter Workflow input, journal/replay,
  PostgreSQL, logs, telemetry, activity events, or public errors. Persist only
  the SHA-256 digest with the dispatch row.
- Keep browser code free of database rows, provider DTOs, and Workflow internals.

## Primary code and tests

| Responsibility                     | Location                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Catalog and schema validation      | `src/application/turn/tools/client-tool-catalog.ts` and `client-tool-schema.ts` |
| Durable dispatch contract          | `src/application/ports/turn/tools/client-tool-dispatch-store.ts`                |
| Workflow wait and result hook      | `src/workflows/client-tools/index.ts`                                           |
| Authenticated output policy        | `src/application/turn/tools/submit-client-tool-output.ts`                       |
| HTTP route                         | `src/adapters/http/chat/chat-routes.ts`                                         |
| Widget execution and reducer state | `packages/side-chat-widget/src/features/workflow-chat/`                         |

Run the focused service and widget tests for touched behavior. Use the
database-backed client-tool durability lane when changing restart, race, or
ownership semantics; see [verification.md](../operations/verification.md).
