# side-chat-service

Read this when: working on the AI SDK 7 service wing.

Source of truth for: the new service's local build, its WorkflowAgent execution substrate, and the greenfield boundary.

Not source of truth for: product turn policy or the legacy service.

This workspace is the production-shaped AI SDK 7 wing on the Workflow DevKit substrate: a Nitro app (`nitro.config.ts`, module `workflow/nitro`) routing everything except the workflow engine's `/.well-known/workflow/v1/*` endpoints into the Hono app at `src/index.ts`. One turn is one durable `"use workflow"` run (`src/runtime/turn-workflow.ts`) executing a `WorkflowAgent`; cancellation is a durable hook racing the agent stream and aborting a workflow-realm `AbortController`. The single allowed global repair lives in `src/runtime/workflow-abort-signal-patch.ts` — read its header for the root cause, evidence, and removal criterion.

Worlds: dev and the compatibility suite run the embedded local world; production builds select `@workflow/world-postgres` through `WORKFLOW_TARGET_WORLD` at build time and `WORKFLOW_POSTGRES_URL` at runtime (see `src/config/server-config.ts`).

## Commands

- `npm run build --workspace @side-chat/side-chat-service` (Nitro build to `.output/`)
- `npm run test:service:compatibility`
- `npm run dev --workspace @side-chat/side-chat-service`

The compatibility test builds and boots the compiled Nitro output with a credential-free scripted provider, and additionally guards the patch removal criterion: when its "unpatched probe" test starts failing because the probe streams successfully, an upstream fix has shipped and the patch module must be deleted. Production provider and configuration composition arrive in Steps 03 and 04.
