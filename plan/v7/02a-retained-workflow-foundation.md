# Step 02a: Retained Workflow Foundation

Read this when: creating the first production-shaped slice of the new wing.

Source of truth for: exact dependency pins, the initial app/build shape, Workflow/Postgres bootstrap, the scripted provider harness, and one retained end-to-end streamed turn.

Not source of truth for: the final execution-substrate verdict (Step 02b), full configuration (Step 03), production auth/providers/telemetry (Step 04), or product turn policy (Step 05).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 01. Unblocks: Step 02b.

## Outcome

The repository contains the real beginning of `apps/side-chat-service`, not a scratch project. It uses the intended monorepo build, exact pins, disposable Postgres for tests, a scripted AI SDK provider, a minimal `WorkflowAgent`, and the native UI message stream. Everything that passes remains and is extended by later steps.

## Scope

1. Pin one coherent AI SDK 7/Workflow set: `ai`, provider packages, `@ai-sdk/react`, `@ai-sdk/workflow`, `workflow`, and `@workflow/world-postgres`. Update the lockfile and version-governance script together.
2. Create the new Hono service with the Workflow Nitro module and repository TypeScript/build conventions. It must not import the old app or Effect.
3. Bootstrap Postgres World in disposable infrastructure and start/stop its worker through an explicit application lifecycle owner.
4. Add a scripted provider instance and a minimal `WorkflowAgent` workflow with explicit `stopWhen`, `maxRetries: 0`, and timeout.
5. Expose only the minimum retained routes needed here: start one test turn and attach to its native UI message stream. Test-only bypasses must be isolated in the test composition and impossible in the production composition.
6. Add permanent tests for build, boot, readiness, one completed streamed turn, native stream header/finish, persisted workflow terminal state, and clean disposal.

Do not implement product auth, conversation storage, approvals, client tools, capacity, or the final POST contract here. Do not create a second experimental app.

## Verification

```powershell
npm ls ai @ai-sdk/workflow workflow @workflow/world-postgres
npm test -- apps/side-chat-service/src/foundation
npm run typecheck
npm run build
npm run lint:custom
```

## Failure meaning

- Build or boot failure is evidence for Step 02b, not permission to create a compatibility wrapper.
- A scripted provider that cannot cross the compiled workflow boundary must be repaired as a real testability problem; do not switch to billable provider calls in the default suite.
- Any old-app import means the greenfield boundary has already failed.

## Completion checklist

- [ ] New service is retained production-shaped code, not a disposable spike.
- [ ] Exact pins, lockfile, and pin governance agree.
- [ ] Disposable Postgres bootstrap and worker lifecycle are automated.
- [ ] One native streamed turn completes through WorkflowAgent.
- [ ] Foundation tests are permanent and run without credentials.
- [ ] Old app remains unchanged and green.

## Handoff record

App/build layout: pending

Pinned versions: pending

World bootstrap and lifecycle owner: pending

Permanent test modules and commands: pending
