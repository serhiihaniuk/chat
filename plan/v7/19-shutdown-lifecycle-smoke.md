# Step 19: Shutdown Ordering and the Lifecycle Smoke

Read this when: implementing graceful shutdown and the self-terminating end-to-end smoke.

Source of truth for: the shutdown sequence, drain semantics, deploy guidance, and the `test:service:lifecycle` command.

Not source of truth for: capacity mechanics (Step 17) or telemetry content (Step 18).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 16, 17, 18. Unblocks: Step 20.

## Outcome

The process shuts down in a proven order within a bounded budget under every condition (including a blocked provider), repeated signals are safe, and one command proves the whole lifecycle — start, stream, cancel, `[workflow-branch]` crash-resume — with no real credentials.

## Target design

### Shutdown sequence (signal → exit), bounded by `capacity.drainBudgetMs`

1. readiness → false; admission rejects new turns (Step 17);
2. drain: wait for active turns up to the budget; `[fallback]` then abort in-flight provider requests; `[workflow-branch]` remaining runs persist/suspend — the worker resumes them after restart (deploys don't kill turns; this is the branch's operational superpower);
3. close streams/keepalive; close the Hono server;
4. `[workflow-branch]` stop the world worker; close DB pools last;
5. exit within budget + grace even with a never-resolving provider (hard deadline advances past a stuck stage and records it — shutdown cannot hang).

Repeated SIGTERM/SIGINT and repeated programmatic dispose are safe (idempotent coordinator). Startup failure after partial acquisition releases what was acquired and never opens the port.

### Deploy guidance `[workflow-branch]`

Documented in operations docs: drain-deploys (stop admission → drain → deploy), reflecting the self-hosted versioning gap; plus the replay-compatibility discipline (stable workflow function shapes across deploys; version tool names when semantics change).

### Global-state audit at boot

Assert `AI_SDK_DEFAULT_PROVIDER` unset; telemetry registered exactly once (Step 04 assertions re-verified here as part of the smoke).

### The lifecycle smoke

`scripts/test-service-lifecycle.mjs` + `npm run test:service:lifecycle` — self-terminating, fake provider, disposable Postgres, ephemeral port:

1. boot → readiness flips;
2. run a streamed turn to completion; assert persisted message + terminal;
3. start and cancel a second turn; assert cancelled terminal;
4. `[workflow-branch]` start a third turn, `kill -9` the process mid-stream, restart, assert the run resumes to terminal and a reconnect stream delivers it;
5. graceful shutdown; assert exit code, drain behavior, zero leaked handles/child processes;
6. rerun the permanent Step 02b compatibility suite against the production-shaped composition, then re-measure rows/turn with real tools and the final coalescing state.

## Edge cases (each a test)

1. shutdown with an idle server → immediate clean exit;
2. shutdown mid-stream `[fallback]` → provider aborted, terminal persisted, budget respected;
3. shutdown mid-stream `[workflow-branch]` → run suspends; post-restart resume proven (smoke item 4);
4. shutdown with a blocked provider (never-resolving mock) → exits within budget + grace, stage timeout recorded;
5. double SIGTERM → single orderly shutdown;
6. boot failure (bad DB URL) → partial resources released, port never opened, nonzero exit;
7. gauges/probes at zero after the full smoke.

## Verification

```powershell
npm run test:service:lifecycle
npm test -- apps/side-chat-service
npm run typecheck
npm run build
npm run lint:custom
```

Wire the smoke into `docs/operations/verification.md` (what it proves, when to run).

## Completion checklist

- [ ] Ordered bounded shutdown with hard deadlines; repeated-signal safety.
- [ ] Boot-failure release proven; port never opens on failed boot.
- [ ] Smoke green, incl. crash-resume `[workflow-branch]`; rows/turn re-measured and recorded.
- [ ] Drain-deploy guidance in operations docs.
- [ ] All seven edge cases pass.

## Handoff record

Shutdown coordinator module: pending

Smoke output + measured rows/turn: pending

Stage-timeout observations: pending
