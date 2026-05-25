# TypeScript Policy

Strict TypeScript is mandatory. Oxlint rejects `any` and TypeScript directive comments. `scripts/check-source-governance.mjs` enforces the required compiler options, project-reference discipline, and unsafe double-assertion bans that need repository context.

`skipLibCheck: true` is allowed and required. The repository pins dependencies and validates source/package boundaries directly; library declaration churn is not allowed to block product verification unless a dependency upgrade explicitly changes a consumed public API.
