# 1. Capability Status and Diagnostics

## Goal

Make current behavior explicit before adding new capability wiring. The service
must report whether memory, RAG, research, history context, context admission,
and persistence are disabled, no-op, or configured.

## Why First

No-op adapters are useful for local bootstrap, but dangerous when invisible.
Status reporting gives later phases a stable place to prove what the launched
app is actually doing.

## Ownership

| Concern                     | Owner                                         |
| --------------------------- | --------------------------------------------- |
| Capability status model     | `apps/partner-ai-service/src/composition`     |
| Health or diagnostics route | `apps/partner-ai-service/src/inbound/http/**` |
| Default capability docs     | `apps/partner-ai-service/README.md`           |
| Extension seam status notes | `docs/architecture/extension-seams.md`        |

Do not put status decisions in the widget or runtime. Runtime receives prepared
turns; it does not know whether service adapters are no-op or configured.
This status object is service diagnostics only; it is not the portable
capability configuration or manifest API that `partner-ai-core` owns.

## Implementation Steps

1. Add a service-owned capability status object.

   Suggested shape:

   ```ts
   export type ServiceCapabilityStatus = {
     readonly memory: CapabilityStatus;
     readonly rag: CapabilityStatus;
     readonly research: CapabilityStatus;
     readonly history: CapabilityStatus;
     readonly contextAdmission: CapabilityStatus;
     readonly persistence: CapabilityStatus;
   };

   export type CapabilityStatus = {
     readonly capability: string;
     readonly state: "disabled" | "noop" | "configured" | "misconfigured";
     readonly adapterId?: string;
     readonly reason?: string;
     readonly safeForProduction: boolean;
   };
   ```

   Keep this boring. The status object is for humans, tests, and diagnostics to
   see what is actually running.

2. Report status through health or diagnostics.

   Include:

   ```txt
   memory adapter status
   RAG retriever status and configured source count
   research agent status
   history context status
   context admission policy id
   persistence backend status
   ```

   Example safe response shape:

   ```json
   {
     "service": "side-chat",
     "capabilities": {
       "history": {
         "state": "configured",
         "adapterId": "postgres-conversation-repository",
         "safeForProduction": true
       },
       "memory": {
         "state": "noop",
         "adapterId": "noop-memory-port",
         "reason": "memory mode is noop",
         "safeForProduction": false
       },
       "rag": {
         "state": "disabled",
         "safeForProduction": true
       }
     }
   }
   ```

3. Keep diagnostics safe.

   Do not expose secrets, connection strings, raw memory content, retrieved
   document text, provider requests, or private context board content.

4. Update service docs.

   State the default app behavior honestly: seams may exist while concrete
   adapters are disabled or no-op.

## Tests

```txt
[ ] default local service reports disabled/no-op capabilities explicitly
[ ] configured test service reports configured capabilities
[ ] production-like config rejects enabled capabilities with no concrete adapter
[ ] diagnostics omit secrets and private content
[ ] docs do not claim memory/RAG/research are production-ready before app-path tests exist
```

## Exit Criteria

```txt
[ ] A reviewer can tell from service status whether memory/RAG/research are real.
[ ] Default no-op fallbacks are visible in diagnostics or health.
[ ] Production-like config fails if enabled memory/RAG/research has no concrete adapter.
[ ] Docs distinguish "seam exists" from "capability is configured."
```
