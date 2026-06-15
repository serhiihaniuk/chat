# 03 — Durable Postgres Persistence Path

## Goal

Make the real-model local app run with the real Postgres persistence path.

The audit says the real-model run successfully called OpenAI, but the Postgres insert path failed, so the service was run with `SIDECHAT_DATABASE_URL` cleared and fell back to in-memory repositories. That proves provider integration, not durable history or durable memory.

## Why this phase matters

History and memory should not be built on a persistence path that only works in process memory.

This phase does not need to implement memory yet. It must make durable conversation/message/context snapshot persistence trustworthy before memory write persistence depends on it.

## Target files

```txt
apps/partner-ai-service/src/config/service-config.ts
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
packages/db/src/schema-contract/repositories.ts
packages/db/src/repositories/postgres-drizzle/**
packages/db/src/repositories/memory/**
test-harness/widget-harness/e2e/persistent.spec.ts
```

## Implementation tasks

```txt
[ ] Reproduce and document the exact Postgres insert failure.
[ ] Identify whether the root cause is schema drift, migration mismatch, runtime defaults, nullability, enum mismatch, or timestamp/id generation.
[ ] Fix the schema/migration/repository mismatch in one final-state shape.
[ ] Remove any local workaround that clears SIDECHAT_DATABASE_URL to get the real-model harness running.
[ ] Ensure conversation creation, user message append, assistant turn creation, context snapshot persistence, terminal completion/failure, and history read all use the same Postgres repository path.
[ ] Ensure reset behavior is durable.
[ ] Add diagnostics that indicate the active persistence adapter.
```

## Persistence invariants

```txt
[ ] User turn insert and assistant turn insert are durable.
[ ] Assistant terminal update is durable.
[ ] Context snapshot persistence uses the same request/turn identifiers as runtime execution.
[ ] History endpoint returns persisted messages after service restart.
[ ] In-memory repositories remain available for local/dev tests, but production-like config does not silently fall back to them.
```

## Tests to add/update

```txt
[ ] Postgres-backed service can create a conversation and append user/assistant messages.
[ ] History endpoint returns persisted messages after restart or fresh service composition.
[ ] Reset conversation removes or hides previous messages from future history/context.
[ ] Context snapshot persistence works on the Postgres path.
[ ] A production-like config with database URL uses Postgres, not memory repositories.
```

If test environment setup is heavy, separate deterministic repository tests from one persistent harness smoke. But do not rely only on in-memory tests.

## Acceptance criteria

```txt
[ ] Real-model service can run with Postgres enabled.
[ ] User and assistant turns persist without insert errors.
[ ] History endpoint returns persisted messages after restart.
[ ] Context snapshot persistence works on the same path.
[ ] Diagnostics expose active persistence adapter without secrets.
```
