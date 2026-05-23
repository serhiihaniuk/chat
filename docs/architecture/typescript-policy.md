# TypeScript Policy

Strict TypeScript is mandatory. `scripts/check-typescript-rules.mjs` enforces the required compiler options and rejects `any`, `@ts-ignore`, and unsafe double assertions in source.

`skipLibCheck: true` is allowed and required. The repository pins dependencies and validates source/package boundaries directly; library declaration churn is not allowed to block product verification unless a dependency upgrade explicitly changes a consumed public API.
