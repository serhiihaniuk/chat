# Tool Approvals

Read this when: you add an approval policy, change the approval card or endpoint, execute an approved server tool, or test approval durability.
Source of truth for: the durable server-tool approval lifecycle, decision authority, hook resumption, timeout behavior, and approval security invariants.
Not source of truth for: client tools ([client-tools.md](client-tools.md)), the general turn lifecycle ([assistant-turn.md](assistant-turn.md)), or Workflow realm boundaries ([workflow-substrate.md](workflow-substrate.md)).

Tool approval is a durable human decision before a server tool may execute.
Only server tools use this gate. A client tool already delegates execution to the
browser and follows the separate durable dispatch contract.

## Lifecycle

1. The server-tool catalog resolves the tool's `ungated`, `always`, or conditional approval policy.
2. The Workflow hashes the validated input and creates the approval row in a Node step.
3. Only after persistence succeeds does the journal emit `tool-approval-request` with `approvalId` and `toolCallId`.
4. The widget renders the native approval card from that stream part.
5. `POST /api/chat/:runId/approvals/:approvalId` authenticates the actor and reads `approved` or `denied`.
6. PostgreSQL records the first authorized decision, actor, and audit timestamps.
7. The route resumes `approval:<runId>:<approvalId>`; the Workflow rereads the row.
8. An approved decision executes once with an input-bound execution key. A denied or expired decision returns a native denial output.

The database row is the decision authority. A Workflow hook only wakes the
suspended run. If a decision lands before hook registration or while a restarted
run is restoring its hook, the durable decision remains valid and the route
returns a retryable conflict until the wait is resumable.

## Integrity and timeout

Approval identity binds workspace, subject, conversation, turn, run, tool call,
tool name, and an input digest. The Workflow rereads using the same identity, so
a decision for one invocation cannot authorize another input. Approval expiry is
durable; the provider timeout is suspended while a human decision is pending and
restarts only after the final parallel approval wait releases.

Execution uses a durable execution key derived from the approval identity and
input digest. The server-tool adapter must use that key for idempotency where the
external system supports it. An approval decision does not grant broader tool,
tenant, or conversation authority.

## Security and privacy

- Authenticate and prove ownership before reading the decision body.
- Re-evaluate the current tool schema and approval policy when resuming durable work.
- Never expose raw tool input, private output, approval digests, or actor details in public stream metadata.
- Persist the decision before resuming Workflow; never let a hook payload become authority.
- Keep approval cards as security-owned interaction surfaces; custom activity renderers cannot replace them.

## Primary code and tests

| Responsibility                    | Location                                                         |
| --------------------------------- | ---------------------------------------------------------------- |
| Approval policy                   | `src/application/turn/tools/server-tools/server-tool-catalog.ts` |
| Decision and workflow-store ports | `src/application/ports/turn/tools/tool-approval-store.ts`        |
| Authenticated decision policy     | `src/application/turn/tools/approvals/submit-tool-approval.ts`   |
| Workflow gate                     | `src/workflows/server-tools/index.ts`                            |
| Persistence step                  | `src/workflows/production/approvals/tool-approval.ts`            |
| Hook resumption                   | `src/workflows/tool-approvals/index.ts`                          |
| HTTP route                        | `src/adapters/http/chat/chat-routes.ts`                          |

Run focused approval route, application, Workflow, and widget tests. Run
`npm run test:service:compatibility` when changing compiled Workflow approval
physics, and the database integration lane when changing persistence or restart
semantics.
