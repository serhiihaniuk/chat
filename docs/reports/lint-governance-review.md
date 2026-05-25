# Lint And Governance Review

Generated: 2026-05-25

## Oxlint Shape

- The root Oxlint command uses `oxlint --deny-warnings .` without `--config`, so nested package/app configs are available.
- Package/app configs may be added as `.oxlintrc.json` or `oxlint.config.ts`, but they must explicitly `extends` the root config. Oxlint uses the nearest config for each file and does not auto-merge parent configs.
- Keep `options.typeAware` only in the root config. Nested configs should stay focused on local rules and overrides.
- JS custom plugins are available through `jsPlugins`, but Oxlint marks them alpha. Prefer built-in Rust rules and the current Node governance scanners for repo-wide graph checks until a plugin has a clear performance or editor-integration payoff.

## Changes Made

- Root `.oxlintrc.json` now enables the full `correctness` category instead of carrying a generated list of default correctness rules.
- The explicit rule list now contains only repo policy, non-default safety rules, React/Vitest rules, and strict TypeScript rules.
- The duplicate source checks were consolidated:
  - Removed `scripts/check-code-quality.mjs`.
  - Removed `scripts/check-test-placement.mjs`.
  - Removed `scripts/check-typescript-rules.mjs`.
  - Added `scripts/check-source-governance.mjs` for checks Oxlint does not express well.
- `no-debugger`, `no-alert`, focused/skipped Vitest tests, `any`, and TypeScript directive comments are now owned by Oxlint.

## Script Ownership

Keep these as custom scripts:

- `check-runtime-pins.mjs`: validates the executing Node/npm versions and `.nvmrc`.
- `check-version-pins.mjs`: enforces exact dependency pins and strategic package version pins.
- `check-dependency-policy.mjs`: enforces package dependency allowlists.
- `check-unused-dependencies.mjs`: scans workspace dependency usage with repo-specific exceptions.
- `check-package-exports.mjs`: validates package metadata and root TypeScript references.
- `check-boundaries.mjs`: enforces package area import ownership and package-private import style.
- `check-widget-layers.mjs`: enforces FSD layer direction, cross-slice imports, obsolete aliases, widget entrypoint shape, and fixture text bans.
- `check-runtime-boundaries.mjs`: enforces runtime owner boundaries for env, Hono, DB, and AI SDK imports.
- `check-outbound-rules.mjs`: enforces approved outbound network locations.
- `check-source-governance.mjs`: keeps non-lintable source policies: test placement, line budgets, tracked artifacts, tsconfig policy, double assertions, and local `ToolLoopAgent` shadows.
- `check-generated-artifacts.mjs`: validates generated artifact presence and provenance headers.
- `check-governance-fixtures.mjs`: regression-tests the governance checks themselves.

Good future Oxlint candidates:

- Add package-level `.oxlintrc.json` files when a package needs local browser/node globals or local import restrictions.
- Move simple static import bans into nested configs only when the rule is package-local and does not need package graph or path-resolution context.
- Consider a custom Oxlint JS plugin later for FSD editor diagnostics, but keep `check-widget-layers.mjs` as the source of truth unless JS plugin stability and performance are proven in this repo.
