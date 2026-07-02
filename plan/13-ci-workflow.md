# 13 — CI workflow

**Epic:** 2 First-run | **Priority:** P0 | **Depends on:** — | **Status:** todo

## Problem (verified)

owner note (we don't need to do it, remind me and ask why.)

There is no `.github` directory. `npm run verify` (format, oxlint, typecheck, vitest, build, 14 governance gates), the db container integration suite, and the Playwright e2e run only when someone remembers. Multiple confirmed rot cases exist precisely because nothing executes the gates: the "generated" schema drifted, the e2e suite asserts a deleted UI, a workspace test-file list already misses a test (`packages/agent-runtime/package.json:55` omits `text-delta-coalescer.test.ts` — root vitest catches it, the workspace script doesn't). The repo's governance tooling is excellent and simply never runs.

## Decided approach

GitHub Actions, three jobs on push/PR to `main`:

1. **verify** — `npm ci` + `npm run verify` on the pinned runtime (`node 24.16.0` / `npm 11.15.0` per README; use `actions/setup-node` with the exact version and cache npm). This alone closes the "gaps hidden from CI" class.
2. **db-integration** — the Testcontainers lane: `npm run test:db:container` (needs Docker; ubuntu-latest runners have it). If runtime cost matters, keep it on PR-to-main only.
3. **e2e** — `npm run test:e2e` with Playwright browsers cached (`npx playwright install --with-deps chromium`). **Gate this job on story 30** (the suite currently asserts a deleted UI and would be red): add the job now with `continue-on-error: true` and a loud TODO referencing story 30, flip to required when 30 lands.

Also:

- Fix the agent-runtime workspace test script to a glob so the file list can't drift.
- Add a status badge to the README.
- Windows note: the repo is developed on Windows; CI on ubuntu is fine (verify is OS-neutral), but keep `core.autocrlf`-safe expectations (oxfmt owns formatting).

## Tasks

1. `.github/workflows/ci.yml` with the three jobs, concurrency-cancel on same ref, npm cache.
2. Pin node/npm exactly; fail if `package-lock.json` drifts (`npm ci` does).
3. Fix `packages/agent-runtime/package.json` test script to `vitest run src` (or drop the workspace script in favor of root vitest filtering).
4. README badge + one line in `docs/operations/verification.md` stating CI runs the same gate as `npm run verify`.
5. Confirm `check-governance-fixtures` (the meta-gate) passes in CI — it self-tests all 14 gates.

## Acceptance criteria

- [ ] A PR that violates any governance gate (e.g. adds a forbidden import) goes red in CI.
- [ ] db container suite runs green in CI.
- [ ] e2e job exists (allowed-failure until story 30, then required).
- [ ] Workspace test script can no longer silently skip a test file.

## Verification

Push a branch; observe all jobs. Locally: `npm run verify` must match the CI verify job's steps exactly.
