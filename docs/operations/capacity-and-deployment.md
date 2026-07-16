# Capacity And Deployment

Read this when: you are sizing, scaling, or operating the replacement Side Chat service.
Source of truth for: admission limits, Workflow worker and Postgres pool alignment, and replica-level capacity.
Not source of truth for: individual config declarations ([configuration.md](configuration.md)), database lifecycle and retention ([database.md](database.md)), or turn ordering ([../architecture/assistant-turn.md](../architecture/assistant-turn.md)).

## Capacity model

Side Chat combines two distinct controls:

- The service owns a per-process ingress gate. It admits a bounded number of turns, waits in a bounded FIFO queue, and rejects overload before durable turn creation.
- The Postgres Workflow world owns durable job queueing, retries, redelivery, suspension, and resume. Its concurrency covers workflow and step jobs; it is not a provider-only limit.

Do not add a second durable lease or retry system around Workflow. A process-local admission reservation remains held until its durable turn reaches a terminal outcome. Workflow may release its own worker slot while that turn is suspended.

The default replacement settings are:

| Setting                      |  Default | Meaning                                                       |
| ---------------------------- | -------: | ------------------------------------------------------------- |
| `capacity.maxActiveTurns`    |     `16` | Maximum admitted, non-terminal turns in one service process.  |
| `capacity.queueSize`         |     `32` | Maximum requests waiting for local admission.                 |
| `capacity.queueTimeoutMs`    |  `5_000` | Maximum local admission wait.                                 |
| `capacity.drainBudgetMs`     | `20_000` | Maximum graceful wait for accepted turns before cleanup.      |
| `workflow.workerConcurrency` |     `50` | Maximum concurrent jobs run by one Postgres Workflow worker.  |
| `workflow.maxPoolSize`       | required | Maximum Postgres connections available to the Workflow world. |

Queue-full and queue-timeout outcomes map to HTTP `503` with `Retry-After: 5`. Admission occurs before the durable turn write, so rejected requests leave no turn residue.

`timeouts.queueMs` is unrelated to admission. It bounds Workflow readiness during startup; `capacity.queueTimeoutMs` bounds an individual request's admission wait.

## Required headroom

Boot validation enforces both sizing relationships:

```text
workflow.workerConcurrency >= capacity.maxActiveTurns + 4
workflow.maxPoolSize >= max(10, workflow.workerConcurrency + 2)
```

The fixed four-worker margin leaves room for Workflow resume, timeout, and maintenance work when admitted turns are busy. The two-connection pool margin follows the Postgres World sizing requirement. With the default worker concurrency, set the pool to at least `52`.

Set the Workflow values with `WORKFLOW_POSTGRES_WORKER_CONCURRENCY` and required `WORKFLOW_POSTGRES_MAX_POOL_SIZE`. The pool variable has no application fallback because Postgres World would otherwise retain the `pg` default of `10`; invalid or missing production sizing fails boot instead of running with hidden contention.

## Replica sizing

Admission is intentionally local to each service process. With `R` replicas, the configured upper bound is:

```text
global admitted turns <= R * capacity.maxActiveTurns
global queued requests <= R * capacity.queueSize
```

Load balancing can make the instantaneous distribution uneven, so these are fleet ceilings rather than fair per-user quotas. Exact provider-wide or cross-replica partitions require a separately approved distributed design or an upstream named Workflow queue.

Budget Postgres connections per replica from both the product database pool and the Workflow pool. Keep the Workflow pool at or above the validated formula, then multiply by the maximum simultaneously running service processes during rolling deploys. Include deployment overlap, maintenance clients, and database administration headroom in `max_connections`.

## SSE and durable state

Open widgets and active turns hold HTTP/SSE connections, but connection count does not define generation capacity. Size socket and proxy limits from concurrent open panels and active streams. Size provider and database budgets from admitted turns, Workflow concurrency, and measured step behavior.

Workflow journal data and product conversation data are durable Postgres state. Follow [database.md](database.md) for schema ownership, maintenance, and retention. Do not infer retention policy from admission settings.

## Drain deploys

The production artifact uses Nitro's `node_middleware` output behind a repository-owned Node listener. This is intentional: the pinned stock Node preset starts listener closure as soon as it receives a signal, before application admission can stop and drain. The owned listener instead makes readiness false, rejects new turns, waits up to `capacity.drainBudgetMs`, closes SSE streams and the listener, stops the Workflow world, and closes product resources with database pools last.

Use rolling deploys with readiness removal before termination. Keep workflow function shapes replay-compatible while old runs can resume on the new artifact. When a tool or workflow meaning changes, publish a new name instead of changing the behavior behind an in-flight durable history.

## Verify

Run the focused capacity and configuration checks before the broader service gate:

```powershell
npm test -- apps/side-chat-service/src/adapters/capacity
npm test -- apps/side-chat-service/src/config/settings/resolve-settings.test.ts
npm run typecheck
```
