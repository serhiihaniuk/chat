# TypeScript Policy

Strict TypeScript is mandatory. Oxlint rejects `any` and TypeScript directive comments. `scripts/check-source-governance.mjs` enforces the required compiler options, project-reference discipline, and unsafe double-assertion bans that need repository context.

`skipLibCheck: true` is allowed and required. The repository pins dependencies and validates source/package boundaries directly; library declaration churn is not allowed to block product verification unless a dependency upgrade explicitly changes a consumed public API.

Product, protocol, runtime, route, provider/model, environment, and error
literals should be exported from constant objects. Constant object names and
properties use uppercase names, for example `RUNTIME_EVENT_TYPES.OUTPUT_DELTA`.

In Effect-first server packages, use `Effect.fail`, `Effect.try`, and
`Effect.tryPromise` for expected failures instead of raw `throw`. Raw throws are
defects and should be caught only at explicit package or adapter boundaries.
