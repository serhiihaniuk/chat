# testing

Read this when: editing shared test helpers.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: production behavior.

## Owns

- Shared test helpers used by multiple packages.
- Deterministic fixtures that are not product workflow code.

## Does Not Own

- Production code paths.
- Package-specific business fixtures that should live beside a package.
- Browser harness scenarios.

## Public Surface

Test-only helpers exported for workspace tests.

## Boundary Rules

- Production source must not import this package.
- Keep helpers scenario-named and deterministic.
- Prefer colocated package test support for package-specific behavior.

## Tests

Consumers prove helper behavior through their package tests.

## Canonical Docs

- `docs/operations/verification.md`
